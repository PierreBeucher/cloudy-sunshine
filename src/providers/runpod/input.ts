import { runpodInstanceInput } from "./state"
import { CommonInstanceInput } from "../../core/state/state"
import { input, select } from '@inquirer/prompts';
import { runpodClient } from "../../tools/runpod";
import { AbstractInputPrompter } from "../../core/input/prompter";
import lodash from 'lodash'
import { CLI_OPTION_DISK_SIZE, CLI_OPTION_PUBLIC_IP_TYPE, CLI_OPTION_SPOT, CliCommandGenerator, CreateCliArgs } from "../../core/input/cli";
import { CLOUDYPAD_PROVIDER_RUNPOD, PUBLIC_IP_TYPE } from "../../core/const";
import { InteractiveInstanceInitializer } from "../../core/initializer";
import { PartialDeep } from "type-fest";

export interface runpodCreateCliArgs extends CreateCliArgs {
    spot?: boolean
    diskSize?: number
    publicIpType?: PUBLIC_IP_TYPE
    instanceType?: string
    region?: string
}

export class runpodInputPrompter extends AbstractInputPrompter<runpodCreateCliArgs, runpodInstanceInput> {

    cliArgsIntoInput(cliArgs: runpodCreateCliArgs): PartialDeep<runpodInstanceInput> {
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

    protected async promptSpecificInput(defaultInput: CommonInstanceInput & PartialDeep<runpodInstanceInput>): Promise<runpodInstanceInput> {

        this.logger.debug(`Starting runpod prompt with default opts: ${JSON.stringify(defaultInput)}`)

        const instanceType = await this.instanceType(defaultInput.provision?.instanceType)
        const useSpot = await this.useSpotInstance(defaultInput.provision?.useSpot)
        const diskSize = await this.diskSize(defaultInput.provision?.diskSize)
        const publicIpType = await this.publicIpType(defaultInput.provision?.publicIpType)
        const region = await this.region(defaultInput.provision?.region)

        const runpodInput: runpodInstanceInput = lodash.merge(
            {},
            defaultInput,
            {
                provision: {
                    diskSize: diskSize,
                    instanceType: instanceType,
                    publicIpType: publicIpType,
                    region: region,
                    useSpot: useSpot,
                }
            })

        return runpodInput

    }

    private async instanceType(instanceType?: string): Promise<string> {
        if (instanceType) {
            return instanceType;
        }

        const choices = [
            "g4dn.xlarge", "g4dn.2xlarge", "g4dn.4xlarge",
            "g5.xlarge", "g5.2xlarge", "g5.4xlarge"
        ].sort().map(type => ({
            name: type,
            value: type,
        }))

        choices.push({ name: "Let me type an instance type", value: "_" })

        const selectedInstanceType = await select({
            message: 'Choose an instance type:',
            default: "g4dn.xlarge",
            choices: choices,
        })

        if (selectedInstanceType === '_') {
            return await input({
                message: 'Enter machine type:',
            })
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

        const currentrunpodRegion = await runpodClient.getCurrentRegion()
        const regions = await runpodClient.listRegions()

        return await select({
            message: 'Select an runpod region to deploy instance:',
            choices: regions.map(r => ({
                name: r,
                value: r,
            })),
            loop: false,
            default: currentrunpodRegion,
        })
    }
}

export class runpodCliCommandGenerator extends CliCommandGenerator {

    buildCreateCommand() {
        return this.getBaseCreateCommand(CLOUDYPAD_PROVIDER_RUNPOD)
            .addOption(CLI_OPTION_SPOT)
            .addOption(CLI_OPTION_DISK_SIZE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .option('--instance-type <type>', 'EC2 instance type')
            .option('--region <region>', 'Region in which to deploy instance')
            .action(async (cliArgs) => {
                try {
                    await new InteractiveInstanceInitializer({
                        inputPrompter: new runpodInputPrompter(),
                        provider: CLOUDYPAD_PROVIDER_RUNPOD,
                    }).initializeInstance(cliArgs)

                } catch (error) {
                    console.error('Error creating runpod instance:', error)
                    process.exit(1)
                }
            })
    }
}