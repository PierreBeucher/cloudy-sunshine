import { getLogger, Logger } from '../log/utils';
import { loadConfig } from "@smithy/node-config-provider";
import { NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS } from "@smithy/config-resolver";

/**
 * Region to use when no client region is configured
 */
export const DEFAULT_REGION = "us-east-1"

export class RunpodClient {


    private static readonly staticLogger = getLogger(RunpodClient.name)

    /**
     * Return currently set region (as identified by AWS SDK).
     * @returns currently configured region - undefined if not region currently set
     */
    static async getCurrentRegion(): Promise<string | undefined> {
        // AWS SDK V3 does not provide an easy way to get current region
        // Use this method taken from https://github.com/aws/aws-sdk-js-v3/discussions/4488
        try {
            return await loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS)()
        } catch (e) {
            RunpodClient.staticLogger.debug("Couldn't fin AWS region: ", e)
            return undefined
        }
    }

    static async listRegions(): Promise<string[]> {
        // listRegions() may be called with no configured region
        // Use a default region in such scenario
        const region = await RunpodClient.getCurrentRegion() ?? DEFAULT_REGION
        const accountClient = new AccountClient({ region: region })
        return RunpodClient.listRegionWithPage(accountClient)
    }

    private static async listRegionWithPage(accountClient: AccountClient, nextToken?: string): Promise<string[]> {

        const command = new ListRegionsCommand({ NextToken: nextToken });
        const result = await accountClient.send(command)

        const regions = result.Regions?.filter(r => r.RegionName).map(r => r.RegionName!) ?? [];

        if (result.NextToken) {
            return regions.concat(await this.listRegionWithPage(accountClient, result.NextToken))
        } else {
            return regions
        }
    }

    private readonly ec2Client: EC2Client
    private readonly stsClient: STSClient
    private readonly logger: Logger
    private readonly region: string

    constructor(name: string, region: string) {
        this.logger = getLogger(name)

        // Region must be explicitely set as most operation require a region which may not be set by default
        // Client code should prompt specify region in such case
        this.region = region
        this.ec2Client = new EC2Client({ region: this.region });
        this.stsClient = new STSClient({ region: this.region });
    }

    async checkAuth() {
        this.logger.debug("Checking AWS authentication")
        try {
            const callerIdentity = await this.stsClient.send(new GetCallerIdentityCommand({}));
            this.logger.debug(`Currently authenticated as ${callerIdentity.UserId} on account ${callerIdentity.Account}`)
        } catch (e) {
            this.logger.error(`Couldn't check AWS authentication`, e)
            this.logger.error(`Is your local AWS config properly set ?`)

            throw new Error(`Couldn't check AWS authentication ` + e)
        }
    }

    async listInstances(): Promise<Instance[]> {
        const describeInstancesCommand = new DescribeInstancesCommand({});

        this.logger.debug(`Listing AWS instances: ${JSON.stringify(describeInstancesCommand)}`)

        const instancesData = await this.ec2Client.send(describeInstancesCommand);

        this.logger.trace(`Describe instances response: ${JSON.stringify(instancesData)}`)

        const instances = instancesData.Reservations?.flatMap(reservation => reservation.Instances).filter(instance => instance !== undefined) || [];
        return instances
    }

    async startInstance(instanceId: string) {
        try {
            const command = new StartInstancesCommand({
                InstanceIds: [instanceId],
            })

            this.logger.debug(`Starting AWS instance: ${JSON.stringify(command)}`)

            const result = await this.ec2Client.send(command)

            this.logger.trace(`Starting EC2 instance response ${JSON.stringify(result)}`)

        } catch (error) {
            this.logger.error(`Failed to start EC2 instance ${instanceId}:`, error)
            throw error
        }
    }

    async stopInstance(instanceId: string) {
        try {
            const command = new StopInstancesCommand({
                InstanceIds: [instanceId],
            });

            this.logger.debug(`Stopping instance: ${JSON.stringify(command)}`)

            const result = await this.ec2Client.send(command);

            this.logger.trace(`Stopping EC2 instance response ${JSON.stringify(result)}`)

        } catch (error) {
            this.logger.error(`Failed to stop EC2 instance ${instanceId}:`, error)
            throw error
        }
    }

    async restartInstance(instanceId: string) {
        try {
            const rebootCommand = new RebootInstancesCommand({
                InstanceIds: [instanceId],
            });

            this.logger.debug(`Restarting instance: ${JSON.stringify(rebootCommand)}`)

            const result = await this.ec2Client.send(rebootCommand);

            this.logger.trace(`Restarting EC2 instance response ${JSON.stringify(result)}`)

        } catch (error) {
            this.logger.error(`Failed to restart EC2 instance ${instanceId}:`, error)
            throw error
        }
    }
}
