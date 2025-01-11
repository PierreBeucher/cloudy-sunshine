import { AwsInstanceInput } from "./state"
import { CommonInstanceInput } from "../../core/state/state"
import { input, select, confirm } from '@inquirer/prompts';
import { AwsClient, EC2_QUOTA_CODE_ALL_G_AND_VT_SPOT_INSTANCES, EC2_QUOTA_CODE_RUNNING_ON_DEMAND_G_AND_VT_INSTANCES } from "../../tools/aws";
import { AbstractInputPrompter, InstanceCreateOptions } from "../../core/cli/prompter";
import lodash from 'lodash'
import { CLI_OPTION_DISK_SIZE, CLI_OPTION_PUBLIC_IP_TYPE, CLI_OPTION_SPOT, CliCommandGenerator, CreateCliArgs, UpdateCliArgs } from "../../core/cli/command";
import { CLOUDYPAD_PROVIDER_AWS, PUBLIC_IP_TYPE } from "../../core/const";
import { InteractiveInstanceInitializer } from "../../core/initializer";
import { PartialDeep } from "type-fest";
import { InstanceManagerBuilder } from "../../core/manager-builder";
import { RUN_COMMAND_CREATE, RUN_COMMAND_UPDATE } from "../../tools/analytics/events";

export interface AwsCreateCliArgs extends CreateCliArgs {
    spot?: boolean
    diskSize?: number
    publicIpType?: PUBLIC_IP_TYPE
    instanceType?: string
    region?: string
}

/**
 * Possible update arguments for AWS update. Region and spot cannot be updated as it would destroy existing machine and/or disk. 
 */
export type AwsUpdateCliArgs = UpdateCliArgs & Omit<AwsCreateCliArgs, "region" | "spot">

/**
 * Supported instance types for AWS. Other instance types may work but are not tested.
 */
export const SUPPORTED_INSTANCE_TYPES = [
    "g4dn.xlarge", "g4dn.2xlarge", "g4dn.4xlarge",
    "g5.xlarge", "g5.2xlarge", "g5.4xlarge", "g5.8xlarge"
]

export class AwsInputPrompter extends AbstractInputPrompter<AwsCreateCliArgs, AwsInstanceInput> {
    
    doTransformCliArgsIntoInput(cliArgs: AwsCreateCliArgs): PartialDeep<AwsInstanceInput> {
        return {
            instanceName: cliArgs.name,
            provision: {
                ssh: {
                    privateKeyPath: cliArgs.privateSshKey,
                },
                instanceType: cliArgs.instanceType,
                diskSize: cliArgs.diskSize,
                publicIpType: cliArgs.publicIpType,
                region: cliArgs.region,
                useSpot: cliArgs.spot,
            },
            configuration: {}
        }
    }

    protected async promptSpecificInput(defaultInput: CommonInstanceInput & PartialDeep<AwsInstanceInput>, createOptions: InstanceCreateOptions): Promise<AwsInstanceInput> {

        this.logger.debug(`Starting AWS prompt with defaultInput: ${JSON.stringify(defaultInput)} and createOptions: ${JSON.stringify(createOptions)}`)
        if(!createOptions.autoApprove){
            await this.informCloudProviderQuotaWarning(CLOUDYPAD_PROVIDER_AWS, "https://cloudypad.gg/cloud-provider-setup/aws.html")
        }

        const region = await this.region(defaultInput.provision?.region)
        const useSpot = await this.useSpotInstance(defaultInput.provision?.useSpot)
        const instanceType = await this.instanceType(region, useSpot, defaultInput.provision?.instanceType)
        const diskSize = await this.diskSize(defaultInput.provision?.diskSize)
        const publicIpType = await this.publicIpType(defaultInput.provision?.publicIpType)
        
        const awsInput: AwsInstanceInput = lodash.merge(
            {},
            defaultInput, 
            {
                provision:{
                    diskSize: diskSize,
                    instanceType: instanceType,
                    publicIpType: publicIpType,
                    region: region,
                    useSpot: useSpot,
                }
            })
        
        return awsInput
        
    }

    private async instanceType(region: string, useSpot: boolean, instanceType?: string): Promise<string> {

        if (instanceType) {
            return instanceType;
        }

        // fetch AWS instance type details
        const awsClient = new AwsClient("instance-type-prompt", region)
        const availableInstanceTypes = await awsClient.filterAvailableInstanceTypes(SUPPORTED_INSTANCE_TYPES)
        const instanceTypeDetails = await awsClient.getInstanceTypeDetails(SUPPORTED_INSTANCE_TYPES)

        const choices = instanceTypeDetails
            .filter(typeInfo => typeInfo.InstanceType)
            .sort((a, b) => {
                // Sort by vCPU count
                const aVCpu = a.VCpuInfo?.DefaultVCpus || 0;
                const bVCpu = b.VCpuInfo?.DefaultVCpus || 0;
                return aVCpu - bVCpu;
            })
            .map(typeInfo => {
                const instanceType = typeInfo.InstanceType! // guaranteed to exist with filter
                const memoryGb = typeInfo.MemoryInfo?.SizeInMiB ? typeInfo.MemoryInfo?.SizeInMiB / 1024 : undefined
                return {
                    name: `${instanceType} - ${typeInfo.VCpuInfo?.DefaultVCpus} vCPU - ${memoryGb} GiB Memory`,
                    value: String(instanceType),
                }
            })

        choices.push({name: "Let me type an instance type", value: "_"})

        const selectedInstanceType = await select({
            message: 'Choose an instance type:',
            default: "g4dn.xlarge",
            choices: choices,
        })

        if(selectedInstanceType === '_'){
            return await input({
                message: 'Enter machine type:',
            })
        }

        // Check quotas for select instance type
        // Depending on spot usage, quota is different
        const quotaCode = useSpot ? EC2_QUOTA_CODE_ALL_G_AND_VT_SPOT_INSTANCES : EC2_QUOTA_CODE_RUNNING_ON_DEMAND_G_AND_VT_INSTANCES
        const currentQuota = await awsClient.getQuota(quotaCode)
        
        const selectInstanceTypeDetails = instanceTypeDetails.find(typeInfo => typeInfo.InstanceType === selectedInstanceType)

        if(currentQuota === undefined || selectInstanceTypeDetails === undefined || selectInstanceTypeDetails.VCpuInfo?.DefaultVCpus === undefined){
            this.logger.warn(`No quota found for machine type ${JSON.stringify(selectInstanceTypeDetails)} in region ${region}`)
            this.logger.warn(`Unable to check for quota before creating instance ${selectedInstanceType} in ${region}. Instance creation may fail.` + 
                `See https://cloudypad.gg/cloud-provider-setup/aws.html for details about quotas`)

        } else if (currentQuota < selectInstanceTypeDetails.VCpuInfo?.DefaultVCpus) {
            this.logger.debug(`Quota found for machine type ${JSON.stringify(selectInstanceTypeDetails)} in region ${region}: ${currentQuota}`)

            const confirmQuota = await confirm({
                message: `Uh oh. It seems quotas for machine type ${selectedInstanceType} in region ${region} may be too low. \n` +
                `You can still try to provision the instance, but it may fail.\n\n` +
                `Current quota: ${currentQuota} vCPUS\n` +
                `Required quota: ${selectInstanceTypeDetails.VCpuInfo?.DefaultVCpus} vCPUs\n\n` +
                `Checkout https://cloudypad.gg/cloud-provider-setup/aws.html for details about quotas.\n\n` +
                `Do you still want to continue?`,
                default: false,
            })

            if(!confirmQuota){
                throw new Error(`Stopped instance creation: detected quota were not high enough for ${selectedInstanceType} in ${region}`)
            }
        }

        return selectedInstanceType        
    }

    private async diskSize(diskSize?: number): Promise<number> {
        if (diskSize) {
            return diskSize;
        }

        const selectedDiskSize = await input({
            message: 'Enter desired disk size (GB):',
            default: "100"
        });

        return Number.parseInt(selectedDiskSize)

    }

    private async region(region?: string): Promise<string> {
        if (region) {
            return region;
        }

        const currentAwsRegion = await AwsClient.getCurrentRegion()
        const regions = await AwsClient.listRegions()

        return await select({
            message: 'Select an AWS region to deploy instance:',
            choices: regions.map(r => ({
                name: r,
                value: r,
            })),
            loop: false,
            default: currentAwsRegion,
        })
    }
}

export class AwsCliCommandGenerator extends CliCommandGenerator {
    
    buildCreateCommand() {
        return this.getBaseCreateCommand(CLOUDYPAD_PROVIDER_AWS)
            .addOption(CLI_OPTION_SPOT)
            .addOption(CLI_OPTION_DISK_SIZE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .option('--instance-type <type>', 'EC2 instance type')
            .option('--region <region>', 'Region in which to deploy instance')
            .action(async (cliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_CREATE, { provider: CLOUDYPAD_PROVIDER_AWS })
                
                try {
                    await new InteractiveInstanceInitializer({ 
                        inputPrompter: new AwsInputPrompter(),
                        provider: CLOUDYPAD_PROVIDER_AWS,
                    }).initializeInstance(cliArgs)
                    
                } catch (error) {
                    throw new Error('Error creating AWS instance:', { cause: error })
                }
            })
    }

    buildUpdateCommand() {
        return this.getBaseUpdateCommand(CLOUDYPAD_PROVIDER_AWS)
            .addOption(CLI_OPTION_DISK_SIZE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .option('--instance-type <type>', 'EC2 instance type')
            .action(async (cliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_UPDATE, { provider: CLOUDYPAD_PROVIDER_AWS })

                try {
                    const input = new AwsInputPrompter().cliArgsIntoInput(cliArgs)
                    const updater = await new InstanceManagerBuilder().buildAwsInstanceUpdater(cliArgs.name)
                    await updater.update({
                        provisionInput: input.provision,
                        configurationInput: input.configuration,
                    }, { 
                        autoApprove: cliArgs.yes
                    })
                    console.info(`Updated instance ${cliArgs.name}`)
                    
                } catch (error) {
                    throw new Error('Error updating AWS instance:', { cause: error })
                }
            })
    }
}