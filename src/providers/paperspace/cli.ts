import { PaperspaceInstanceInput } from "./state"
import { CommonInstanceInput } from "../../core/state/state"
import { AbstractInputPrompter, InstanceCreateOptions } from "../../core/cli/prompter";
import { select, input, password } from '@inquirer/prompts';
import { fetchApiKeyFromEnvironment } from './client/client';
import lodash from 'lodash'
import { PartialDeep } from "type-fest";
import { CLOUDYPAD_PROVIDER_PAPERSPACE, PUBLIC_IP_TYPE } from "../../core/const";
import { CLI_OPTION_DISK_SIZE, CLI_OPTION_PUBLIC_IP_TYPE, CLI_OPTION_SPOT, CliCommandGenerator, CreateCliArgs } from "../../core/cli/command";
import { InteractiveInstanceInitializer } from "../../core/initializer";
import { InstanceManagerBuilder } from "../../core/manager-builder";
import { RUN_COMMAND_CREATE, RUN_COMMAND_UPDATE } from "../../tools/analytics/events";

export interface PaperspaceCreateCliArgs extends CreateCliArgs {
    apiKeyFile?: string
    machineType?: string
    diskSize?: number
    publicIpType?: PUBLIC_IP_TYPE
    region?: string
}

export class PaperspaceInputPrompter extends AbstractInputPrompter<PaperspaceCreateCliArgs, PaperspaceInstanceInput> {
    
    doTransformCliArgsIntoInput(cliArgs: PaperspaceCreateCliArgs): PartialDeep<PaperspaceInstanceInput> {
        return {
            instanceName: cliArgs.name,
            provision: {
                ssh: {
                    privateKeyPath: cliArgs.privateSshKey
                },
                apiKey: cliArgs.apiKeyFile,
                machineType: cliArgs.machineType,
                diskSize: cliArgs.diskSize,
                publicIpType: cliArgs.publicIpType,
                region: cliArgs.region,
            },
            configuration: {}
        }
    }

    protected async promptSpecificInput(defaultInput: CommonInstanceInput & PartialDeep<PaperspaceInstanceInput>, createOptions: InstanceCreateOptions): Promise<PaperspaceInstanceInput> {

        this.logger.debug(`Starting Paperspace prompt with defaultInput: ${JSON.stringify(defaultInput)} and createOptions: ${JSON.stringify(createOptions)}`)

        if(!createOptions.autoApprove){
            await this.informCloudProviderQuotaWarning(CLOUDYPAD_PROVIDER_PAPERSPACE, "https://cloudypad.gg/cloud-provider-setup/paperspace.html")
        }
        
        const apiKey = await this.apiKey(defaultInput.provision?.apiKey)
        const machineType = await this.machineType(defaultInput.provision?.machineType)
        const diskSize = await this.diskSize(defaultInput.provision?.diskSize)
        const publicIpType = await this.publicIpType(defaultInput.provision?.publicIpType)
        const region = await this.region(defaultInput.provision?.region)
        const sshUser = "paperspace" // Paperspace uses 'paperspace' SSH user, enforce it

        const specificInput = {
            provision: {
                apiKey: apiKey,
                machineType: machineType,
                diskSize: diskSize,
                publicIpType: publicIpType,
                region: region,
                ssh: {
                    user: sshUser,
                }
            },
        }
        
        const psInput: PaperspaceInstanceInput = lodash.merge(
            {},
            defaultInput,
            specificInput
        )

        return psInput
    }

    protected async machineType(machineType?: string): Promise<string> {
        if (machineType) {
            return machineType;
        }

        const choices = ['M4000', 'P4000', 'A4000', 'RTX4000', 'P5000', 'RTX5000', 'P6000', 'A5000', 'A6000' ].sort().map(type => ({ name: type, value: type }))
        choices.push({name: "Let me type an instance type", value: "_"})
        
        const selectedInstanceType = await select({
            message: 'Select machine type:',
            loop: false,
            choices: choices,
            default: "RTX4000"
        })

        if(selectedInstanceType === '_'){
            return await input({
                message: 'Enter machine type:',
            })
        }

        return selectedInstanceType
    }

    protected async diskSize(diskSize?: number): Promise<number> {
        if (diskSize) {
            return diskSize;
        }

        const selectedDiskSize = await select({
            message: 'Select disk size (GB):',
            choices: ['50', '100', '250', '500', '1000', '2000'].map(size => ({ name: size, value: size })),
        });

        return Number.parseInt(selectedDiskSize);
    }

    protected async region(region?: string): Promise<string> {
        if (region) {
            return region;
        }

        return await select({
            message: 'Select region for new machine:',
            choices: ['East Coast (NY2)', 'West Coast (CA1)', 'Europe (AMS1)'].map(r => ({ name: r, value: r }))
        });
    }

    protected async apiKey(apiKey?: string): Promise<string>{
        if (apiKey) return apiKey

        const envApiKey = fetchApiKeyFromEnvironment() 

        if(envApiKey.length == 0) {
            return await password({
                message: 'No Paperspace API Key found. Restart with environment variable PAPERSPACE_API_KEY or enter API Key:'
            });
        } else if(envApiKey.length == 1){
            return envApiKey[0]
        } else {
            throw new Error("Found multiple keys in your Paperspace home config. Please specify a single key suing either PAPERSPACE_API_KEY." +
                "(Later version will support multiple keys and let you specify a team to choose from)")
        }
    }
}

export class PaperspaceCliCommandGenerator extends CliCommandGenerator {
    
    buildCreateCommand() {
        return this.getBaseCreateCommand(CLOUDYPAD_PROVIDER_PAPERSPACE)
            .addOption(CLI_OPTION_SPOT)
            .addOption(CLI_OPTION_DISK_SIZE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .option('--api-key-file <apikeyfile>', 'Path to Paperspace API key file')
            .option('--machine-type <type>', 'Machine type')
            .option('--region <region>', 'Region in which to deploy instance')
            .action(async (cliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_CREATE, { provider: CLOUDYPAD_PROVIDER_PAPERSPACE })
                try {
                    await new InteractiveInstanceInitializer({ 
                        inputPrompter: new PaperspaceInputPrompter(),
                        provider: CLOUDYPAD_PROVIDER_PAPERSPACE,
                    }).initializeInstance(cliArgs)
                    
                } catch (error) {
                    throw new Error('Error creating Paperspace instance:', { cause: error })
                }
            })
    }

    buildUpdateCommand() {
        return this.getBaseUpdateCommand(CLOUDYPAD_PROVIDER_PAPERSPACE)
            .addOption(CLI_OPTION_DISK_SIZE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .option('--api-key-file <apikeyfile>', 'Path to Paperspace API key file')
            .option('--machine-type <type>', 'Machine type')
            .action(async (cliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_UPDATE, { provider: CLOUDYPAD_PROVIDER_PAPERSPACE })
                try {
                    const input = new PaperspaceInputPrompter().cliArgsIntoInput(cliArgs)
                    const updater = await new InstanceManagerBuilder().buildPaperspaceInstanceUpdater(cliArgs.name)
                    await updater.update({
                        provisionInput: input.provision,
                        configurationInput: input.configuration,
                    }, { 
                        autoApprove: cliArgs.yes
                    })
                    console.info(`Updated instance ${cliArgs.name}`)
                    
                } catch (error) {
                    throw new Error('Error updating Paperspace instance:', { cause: error })
                }
            })
    }
}

