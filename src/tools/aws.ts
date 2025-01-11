import { EC2Client, DescribeInstancesCommand, Instance, StartInstancesCommand, StopInstancesCommand, RebootInstancesCommand, waitUntilInstanceRunning, waitUntilInstanceStopped, DescribeInstanceTypesCommand, _InstanceType, InstanceTypeInfo, InstanceTypeOffering, DescribeInstanceTypeOfferingsCommand } from '@aws-sdk/client-ec2'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { getLogger, Logger } from '../log/utils'
import { loadConfig } from "@smithy/node-config-provider"
import { NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS } from "@smithy/config-resolver"
import { AccountClient, ListRegionsCommand } from "@aws-sdk/client-account"
import { ServiceQuotasClient, GetServiceQuotaCommand } from '@aws-sdk/client-service-quotas'

/**
 * Region to use when no client region is configured
 */
export const DEFAULT_REGION = "us-east-1"

export interface StartStopOptions {
    wait?: boolean
    waitTimeoutSeconds?: number
}

const DEFAULT_START_STOP_OPTION_WAIT=false

// Generous default timeout as G instances are sometime long to stop
const DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT=60*8

// Quote code used by AWS API
// All G and VT Spot Instance Requests
export const EC2_QUOTA_CODE_ALL_G_AND_VT_SPOT_INSTANCES = "L-3819A6DF"
// Running On-Demand G and VT instances
export const EC2_QUOTA_CODE_RUNNING_ON_DEMAND_G_AND_VT_INSTANCES = "L-DB2E81BA"

export class AwsClient {


    private static readonly staticLogger = getLogger(AwsClient.name)
    
    /**
     * Return currently set region (as identified by AWS SDK).
     * @returns currently configured region - undefined if not region currently set
     */
    static async getCurrentRegion(): Promise<string | undefined> {
        // AWS SDK V3 does not provide an easy way to get current region
        // Use this method taken from https://github.com/aws/aws-sdk-js-v3/discussions/4488
        try {
            return await loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS)()
        } catch (e){
            AwsClient.staticLogger.debug("Couldn't fin AWS region: ", e)
            return undefined
        }
    }

    static async listRegions(): Promise<string[]>{
        // listRegions() may be called with no configured region
        // Use a default region in such scenario
        const region = await AwsClient.getCurrentRegion() ?? DEFAULT_REGION
        const accountClient = new AccountClient({ region: region })
        return AwsClient.listRegionWithPage(accountClient)
    }

    private static async listRegionWithPage(accountClient: AccountClient, nextToken?: string): Promise<string[]>{

        const command = new ListRegionsCommand({ NextToken: nextToken})
        const result = await accountClient.send(command)

        const regions = result.Regions?.filter(r => r.RegionName).map(r => r.RegionName!) ?? []
        
        if(result.NextToken){
            return regions.concat(await this.listRegionWithPage(accountClient, result.NextToken))
        } else {
            return regions
        }
    }

    private readonly ec2Client: EC2Client
    private readonly stsClient: STSClient
    private readonly logger: Logger
    private readonly region: string
    private readonly quotaClient: ServiceQuotasClient

    constructor(name: string, region: string){
        this.logger = getLogger(name)

        // Region must be explicitely set as most operation require a region which may not be set by default
        // Client code should prompt specify region in such case
        this.region = region
        this.ec2Client = new EC2Client({ region: this.region })
        this.stsClient = new STSClient({ region: this.region })
        this.quotaClient = new ServiceQuotasClient({ region })
    }

    async checkAuth() {
        this.logger.debug("Checking AWS authentication")
        try {
            const callerIdentity = await this.stsClient.send(new GetCallerIdentityCommand({}))
            this.logger.debug(`Currently authenticated as ${callerIdentity.UserId} on account ${callerIdentity.Account}`)
        } catch (e) {
            this.logger.error(`Couldn't check AWS authentication`, e)
            this.logger.error(`Is your local AWS config properly set ?`)
            
            throw new Error(`Couldn't check AWS authentication ` + e)
        }
    }

    async listInstances(): Promise<Instance[]>{
        const describeInstancesCommand = new DescribeInstancesCommand({})

        this.logger.debug(`Listing AWS instances: ${JSON.stringify(describeInstancesCommand)}`)

        const instancesData = await this.ec2Client.send(describeInstancesCommand)
        
        this.logger.trace(`Describe instances response: ${JSON.stringify(instancesData)}`)
        
        const instances = instancesData.Reservations?.flatMap(reservation => reservation.Instances).filter(instance => instance !== undefined) || []
        return instances
    }

    async startInstance(instanceId: string, opts?: StartStopOptions) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            const command = new StartInstancesCommand({
                InstanceIds: [instanceId],
            })
    
            this.logger.debug(`Starting AWS instance: ${JSON.stringify(command)}`)
    
            const result = await this.ec2Client.send(command)
            
            this.logger.trace(`Starting EC2 instance response ${JSON.stringify(result)}`)
    
            if (wait) {
                this.logger.debug(`Waiting for instance ${instanceId} to reach 'running' state`)
                await waitUntilInstanceRunning(
                    { client: this.ec2Client, maxWaitTime: waitTimeout  },
                    { InstanceIds: [instanceId] }
                )
                this.logger.trace(`Instance ${instanceId} is now running`)
            }
        } catch (error) {
            this.logger.error(`Failed to start EC2 instance ${instanceId}:`, error)
            throw error
        }
    }

    async stopInstance(instanceId: string, opts?: StartStopOptions) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            const command = new StopInstancesCommand({
                InstanceIds: [instanceId],
            })
    
            this.logger.debug(`Stopping instance: ${JSON.stringify(command)}`)
    
            const result = await this.ec2Client.send(command)
    
            this.logger.trace(`Stopping EC2 instance response ${JSON.stringify(result)}`)
    
            if (wait) {
                this.logger.debug(`Waiting for instance ${instanceId} to reach 'stopped' state`)
                await waitUntilInstanceStopped(
                    { client: this.ec2Client, maxWaitTime: waitTimeout },
                    { InstanceIds: [instanceId] }
                )
                this.logger.trace(`Instance ${instanceId} is now stopped`)
            }
        } catch (error) {
            this.logger.error(`Failed to stop EC2 instance ${instanceId}:`, error)
            throw error
        }
    }
    
    async restartInstance(instanceId: string, opts?: StartStopOptions) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            const rebootCommand = new RebootInstancesCommand({
                InstanceIds: [instanceId],
            })
    
            this.logger.debug(`Restarting instance: ${JSON.stringify(rebootCommand)}`)
    
            const result = await this.ec2Client.send(rebootCommand)
            
            this.logger.trace(`Restarting EC2 instance response ${JSON.stringify(result)}`)
    
            if (wait) {
                this.logger.debug(`Waiting for instance ${instanceId} to reach 'running' state after reboot`)
                await waitUntilInstanceRunning(
                    { client: this.ec2Client, maxWaitTime: waitTimeout },
                    { InstanceIds: [instanceId] }
                )
                this.logger.trace(`Instance ${instanceId} is now fully restarted and running`)
            }
        } catch (error) {
            this.logger.error(`Failed to restart EC2 instance ${instanceId}:`, error)
            throw error
        }
    }

    /**
     * Get quota value for a given quota code
     * @param quotaCode quota code to check
     * @returns quota value if available, undefined if not
     */
    async getQuota(quotaCode: string): Promise<number | undefined> {
        
        try {
            this.logger.debug(`Checking quota code ${quotaCode} in region: ${this.region}`)
            
            const command = new GetServiceQuotaCommand({
                ServiceCode: 'ec2',
                QuotaCode: quotaCode,
            })

            const response = await this.quotaClient.send(command)
            this.logger.trace(`Service Quota Response: ${JSON.stringify(response)}`)
            
            return response.Quota?.Value
        } catch (error) {
            this.logger.error(`Failed to check quota code ${quotaCode} in region ${this.region}:`, error)
            throw error
        }
    }

    /**
     * Fetch instance type details from AWS (vCPU, memory...)
     * @param instanceTypes instance types to fetch details for
     * @returns instance type details
     */
    async getInstanceTypeDetails(instanceTypes: string[]): Promise<InstanceTypeInfo[]> {
        
        try {
            const internalInstanceTypes = stringsToInstanceTypes(instanceTypes)
            const command = new DescribeInstanceTypesCommand({
                InstanceTypes: internalInstanceTypes,
            })
            const response = await this.ec2Client.send(command)
            
            if (response.InstanceTypes && response.InstanceTypes.length > 0) {
                return response.InstanceTypes
            } else {
                throw new Error(`No instance type details found for ${JSON.stringify(instanceTypes)} in region ${this.region}`)
            }

        } catch (error) {
            throw new Error(`Failed to fetch instance details for instance type ${JSON.stringify(instanceTypes)} in region ${this.region}:`, { cause: error })
        }
    }

    /**
     * Filter instance types that are available in client's region
     * @param instanceTypes instance types to filter
     * @returns instance types available in client's region
     */
    async filterAvailableInstanceTypes(instanceTypes: string[]): Promise<string[]> {
        try {
            const internalInstanceTypes = stringsToInstanceTypes(instanceTypes)
            const command = new DescribeInstanceTypeOfferingsCommand({
                LocationType: "region",
                Filters: [
                    {
                        Name: "instance-type",
                        Values: internalInstanceTypes,
                    },
                ],
            })

            const response = await this.ec2Client.send(command)

            const offerings = response.InstanceTypeOfferings || []

            return offerings
                .filter(offering => offering.Location === this.region && offering.InstanceType)
                .map(offering => String(offering.InstanceType))

        } catch (error) {
            throw new Error(`Failed to check availability of instance type ${instanceTypes} in region ${this.region}:`, { cause: error })
        }
    }

}

/**
 * Convert instance type strings to AWS SDK internal instance type object
 * @param instanceTypes instance type strings
 * @returns internal instance type objects
 */
export function stringsToInstanceTypes(instanceTypes: string[]): _InstanceType[] {
    const result: _InstanceType[] = []
    for(const instanceType of instanceTypes) {
        if(Object.values(_InstanceType).includes(instanceType as _InstanceType)) {
            result.push(instanceType as _InstanceType)
        } else {
            throw new Error(`Invalid instance type '${instanceType}', not recognized by AWS SDK`)
        }
    }
    return result
}
