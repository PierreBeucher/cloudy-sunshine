import { getLogger } from "../log/utils"
import { CLOUDYPAD_PROVIDER } from "./const"
import { CreateCliArgs } from "./cli/command"
import { InputPrompter } from "./cli/prompter"
import { InstanceManagerBuilder } from "./manager-builder"
import { StateInitializer } from "./state/initializer"
import { confirm } from '@inquirer/prompts'
import { AnalyticsManager } from "../tools/analytics/manager"
import { CommonInstanceInput } from "./state/state"

export interface InstancerInitializerArgs {
    provider: CLOUDYPAD_PROVIDER
    inputPrompter: InputPrompter
}

export interface InstancerInitializationOptions {

    /**
     * Whether to show post-initialization message on console.
     */
    skipPostInitInfo: boolean
}

/**
 * Initialize a new instance from CLI args. Create a new State and persist to disk before and build an InstanceManager.
 */
export class InteractiveInstanceInitializer {

    private readonly provider: CLOUDYPAD_PROVIDER
    private readonly inputPrompter: InputPrompter
    private readonly logger = getLogger(InteractiveInstanceInitializer.name)
    protected readonly analytics = AnalyticsManager.get()

    constructor(args: InstancerInitializerArgs){
        this.provider = args.provider
        this.inputPrompter = args.inputPrompter
    }

    /**
     * Interactively initialize a new instance from CLI args:
     * - Parse CLI args into known Input interface
     * - Interactively prompt for missing args
     * - Run instance initialization
     */
    async initializeInstance(cliArgs: CreateCliArgs, options?: InstancerInitializationOptions): Promise<void> {
        try {
            this.analyticsEvent("create_instance_start")

            
            this.logger.debug(`Initializing instance from CLI args ${JSON.stringify(cliArgs)} and options ${JSON.stringify(options)}`)
            
            const input = await this.cliArgsToInput(cliArgs)
            const state = await this.doInitializeState(input)
            const manager = await new InstanceManagerBuilder().buildInstanceManager(state.name)
            
            await this.doProvisioning(manager, state.name, cliArgs.yes)
            await this.doConfiguration(manager, state.name)
            await this.doPairing(manager, state.name, cliArgs.skipPairing ?? false, cliArgs.yes ?? false)
            
            this.showPostInitInfo(options)
            this.analyticsEvent("create_instance_finish")
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            this.analyticsEvent("create_instance_error", { errorMessage: errMsg })
            throw new Error(`Error initializing instance: ${errMsg}`, { cause: error})
        }
    }

    private async cliArgsToInput(cliArgs: CreateCliArgs): Promise<CommonInstanceInput> {
        this.analyticsEvent("create_instance_start_input_prompt")
        const input = await this.inputPrompter.completeCliInput(cliArgs)
        this.analyticsEvent("create_instance_finish_input_prompt")
        return input
    }

    private async doInitializeState(input: CommonInstanceInput) {
        this.analyticsEvent("create_instance_start_state_init")
        const state = await new StateInitializer({
            input: input,
            provider: this.provider,
        }).initializeState()
        this.analyticsEvent("create_instance_finish_state_init")
        return state
    }

    private async doProvisioning(manager: any, instanceName: string, autoApprove?: boolean) {
        this.logger.info(`Initializing ${instanceName}: provisioning...`)
        this.analyticsEvent("create_instance_start_provision")
        
        await manager.provision({ autoApprove: autoApprove})
        
        this.analyticsEvent("create_instance_finish_provision")
        this.logger.info(`Initializing ${instanceName}: provision done.}`)
    }

    private async doConfiguration(manager: any, instanceName: string) {
        this.analyticsEvent("create_instance_start_configure")
        this.logger.info(`Initializing ${instanceName}: configuring...}`)
        
        await manager.configure()
        
        this.analyticsEvent("create_instance_finish_configure")
        this.logger.info(`Initializing ${instanceName}: configuration done.}`)
    }

    private async doPairing(manager: any, instanceName: string, skipPairing: boolean, autoApprove: boolean) {

        const doPair = skipPairing ? false : autoApprove ? true : await confirm({
            message: `Your instance is almost ready ! Do you want to pair Moonlight now?`,
            default: true,
        })

        if (doPair) {
            this.analyticsEvent("create_instance_start_pairing")
            this.logger.info(`Initializing ${instanceName}: pairing...}`)
            
            await manager.pair()
            
            this.analyticsEvent("create_instance_finish_pairing")
            this.logger.info(`Initializing ${instanceName}: pairing done.}`)
        } else {
            this.analyticsEvent("create_instance_skipped_pairing")
            this.logger.info(`Initializing ${instanceName}: pairing skipped.}`)
        }
    }

    private showPostInitInfo(options?: InstancerInitializationOptions) {
        if(!options?.skipPostInitInfo){
            console.info("")
            console.info("Instance has been initialized successfully 🥳")
            console.info("")
            console.info("If you like Cloudy Pad please leave us a star ⭐ https://github.com/PierreBeucher/cloudypad")
            console.info("")
            console.info("🐛 A bug ? Some feedback ? Do not hesitate to file an issue: https://github.com/PierreBeucher/cloudypad/issues")    
        }
    }

    private analyticsEvent(event: string, additionalProperties?: Record<string, any>) {
        this.analytics.sendEvent(event, { 
            provider: this.provider, 
            ...additionalProperties 
        })
    }
}
