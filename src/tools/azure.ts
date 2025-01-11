import { ComputeManagementClient, VirtualMachine } from '@azure/arm-compute'
import { DefaultAzureCredential } from '@azure/identity'
import { getLogger, Logger } from '../log/utils'
import { Subscription, SubscriptionClient } from '@azure/arm-subscriptions'
import { AzureQuotaExtensionAPI, LimitObject } from "@azure/arm-quota"

interface StartStopActionOpts {
    wait?: boolean
    waitTimeoutSeconds?: number
}

export interface AzureVMDetails {
    family: string
    subfamily?: string
    vCpuCount: number
    features?: string
}


const DEFAULT_START_STOP_OPTION_WAIT=false

// Generous default timeout as G instances are sometime long to stop
const DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT=60

export class AzureClient {

    private static readonly staticLogger = getLogger(AzureClient.name)

    static async listSubscriptions(): Promise<Subscription[]>{
        const creds = new DefaultAzureCredential()
        const subsClient = new SubscriptionClient(creds)
        const subscriptions = subsClient.subscriptions.list()

        const result: Subscription[] = []
        
        for await (const sub of subscriptions) {
            result.push(sub)
        }
        return result

    }

    static async checkAuth() {
        AzureClient.staticLogger.debug("Checking Azure authentication")
        try {
            const creds = new DefaultAzureCredential()
            const token = await creds.getToken("https://management.azure.com/.default")
            AzureClient.staticLogger.debug(`Azure authentication successful: got token expiring on ${token.expiresOnTimestamp}`)
        } catch (e) {
            AzureClient.staticLogger.error(`Couldn't check Azure authentication: ${JSON.stringify(e)}`)
            AzureClient.staticLogger.error(`Is your local Azure authentication configured?`)
            throw new Error(`Couldn't check Azure authentication: ${JSON.stringify(e)}`)
        }
    }

    private readonly computeClient: ComputeManagementClient
    private readonly logger: Logger
    private readonly credential: DefaultAzureCredential
    private readonly subsClient: SubscriptionClient
    private readonly subcriptionId: string
    private readonly quotaClient: AzureQuotaExtensionAPI
    constructor(name: string, subscriptionId: string) {
        this.logger = getLogger(name)
        this.subcriptionId = subscriptionId
        this.credential = new DefaultAzureCredential()
        this.computeClient = new ComputeManagementClient(this.credential, subscriptionId)
        this.subsClient = new SubscriptionClient(this.credential)
        this.quotaClient = new AzureQuotaExtensionAPI(this.credential)
    }

    async listInstances(): Promise<VirtualMachine[]> {
        this.logger.debug(`Listing Azure virtual machines`)

        const vms = []
        for await (const vm of this.computeClient.virtualMachines.listAll()) {
            vms.push(vm)
        }

        this.logger.trace(`List virtual machines response: ${JSON.stringify(vms)}`)

        return vms
    }

    async startInstance(resourceGroupName: string, vmName: string, opts?: StartStopActionOpts) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            this.logger.debug(`Starting Azure virtual machine: ${vmName}`)
            const poller = await this.computeClient.virtualMachines.beginStart(resourceGroupName, vmName)
    
            if (wait) {
                this.logger.debug(`Waiting for virtual machine ${vmName} to start`)
                await this.withTimeout(poller.pollUntilDone(), waitTimeout * 1000)
            }
        } catch (error) {
            this.logger.error(`Failed to start virtual machine ${vmName}:`, { cause: error })
            throw error
        }
    }

    async stopInstance(resourceGroupName: string, vmName: string, opts?: StartStopActionOpts) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            this.logger.debug(`Stopping Azure virtual machine: ${vmName}`)
            const poller = await this.computeClient.virtualMachines.beginDeallocate(resourceGroupName, vmName)

            if (wait) {
                this.logger.debug(`Waiting for virtual machine ${vmName} to stop`)
                await this.withTimeout(poller.pollUntilDone() , waitTimeout * 1000)
            }

        } catch (error) {
            this.logger.error(`Failed to stop virtual machine ${vmName}:`, { cause: error })
            throw error
        }
    }

    async restartInstance(resourceGroupName: string, vmName: string, opts?: StartStopActionOpts) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            this.logger.debug(`Restarting Azure virtual machine: ${vmName}`)
            const poller = await this.computeClient.virtualMachines.beginRestart(resourceGroupName, vmName)

            if (wait) {
                this.logger.debug(`Waiting for virtual machine ${vmName} to restart`)
                await this.withTimeout(poller.pollUntilDone() , waitTimeout * 1000)
            }

        } catch (error) {
            this.logger.error(`Failed to restart virtual machine ${vmName}:`, error)
            throw error
        }
    }

    async listLocations() {
        const locations = this.subsClient.subscriptions.listLocations(this.subcriptionId)

        const result = []
        for await (const l of locations){
            result.push(l)
        }

        return result

    }

    async listMachineSizes(location: string){

        this.logger.debug(`Listing Azure machine sizes in location: ${location}`)
        const vmSizesResp = this.computeClient.virtualMachineSizes.list(location);
        const vmSizes = []
        for await (const s of vmSizesResp){
            vmSizes.push(s)
        }

        this.logger.debug(`Found ${vmSizes.length} machine sizes in location: ${location}`)

        return vmSizes
    }

    async getComputeQuota(quotaName: string, location: string): Promise<number | undefined> {
        this.logger.debug(`Fetching compute quota ${quotaName} in location: ${location}`)

        try {
            const scope =  `subscriptions/${this.subcriptionId}/providers/Microsoft.Compute/locations/${location}`
            const quotas = await this.quotaClient.quota.get(quotaName, scope)

            this.logger.debug(`Found quota ${quotaName}: ${JSON.stringify(quotas)}`)

            // somehow not recognized as LimitObject, enforce it
            if(quotas.properties?.limit?.limitObjectType === "LimitValue"){
                const limitValue = quotas.properties?.limit as LimitObject
                return limitValue.value
            } else {
                return undefined
            }

        } catch (error) {
            throw new Error(`Failed to check quota ${quotaName} in location ${location}`, { cause: error })
        }
    }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        if (!timeoutMs) {
            return promise
        }
    
        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Operation timed out after ${timeoutMs} ms`))
            }, timeoutMs)
    
            promise
                .then((result) => {
                    clearTimeout(timeoutId)
                    resolve(result)
                })
                .catch((error) => {
                    clearTimeout(timeoutId)
                    reject(error)
                })
        })
    }
    
}
