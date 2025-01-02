import { parseSshPrivateKeyFileToPublic } from '../../tools/ssh';
import { confirm } from '@inquirer/prompts';
import { runpodPulumiClient, PulumiStackConfigrunpod } from '../../tools/pulumi/runpod';
import { AbstractInstanceProvisioner, InstanceProvisionerArgs, InstanceProvisionOptions } from '../../core/provisioner';
import { runpodClient } from '../../tools/runpod';
import { runpodProvisionInputV1, runpodProvisionOutputV1 } from './state';

export type runpodProvisionerArgs = InstanceProvisionerArgs<runpodProvisionInputV1, runpodProvisionOutputV1>

export class runpodProvisioner extends AbstractInstanceProvisioner<runpodProvisionInputV1, runpodProvisionOutputV1> {

    constructor(args: runpodProvisionerArgs) {
        super(args)
    }

    async doProvision(opts?: InstanceProvisionOptions): Promise<runpodProvisionOutputV1> {

        this.logger.info(`Provisioning runpod instance ${this.args.instanceName}`)

        this.logger.debug(`Provisioning runpod instance with args ${JSON.stringify(this.args)} and options ${JSON.stringify(opts)}`)

        let confirmCreation: boolean
        if (opts?.autoApprove) {
            confirmCreation = opts.autoApprove
        } else {
            confirmCreation = await confirm({
                message: `
You are about to provision runpod machine with the following details:
    Instance name: ${this.args.instanceName}
    Spot instance: ${this.args.input.useSpot}
    SSH key: ${this.args.input.ssh.privateKeyPath}
    runpod Region: ${this.args.input.region}
    Instance Type: ${this.args.input.instanceType}
    Public IP Type: ${this.args.input.publicIpType}
    Disk size: ${this.args.input.diskSize}
    
Do you want to proceed?`,
                default: true,
            })
        }

        if (!confirmCreation) {
            throw new Error('runpod provision aborted.');
        }

        const pulumiClient = new runpodPulumiClient(this.args.instanceName)
        const pulumiConfig: PulumiStackConfigrunpod = {
            instanceType: this.args.input.instanceType,
            publicIpType: this.args.input.publicIpType,
            region: this.args.input.region,
            rootVolumeSizeGB: this.args.input.diskSize,
            publicSshKeyContent: await parseSshPrivateKeyFileToPublic(this.args.input.ssh.privateKeyPath),
            useSpot: this.args.input.useSpot,
        }

        await pulumiClient.setConfig(pulumiConfig)
        const pulumiOutputs = await pulumiClient.up()

        return {
            host: pulumiOutputs.publicIp,
            instanceId: pulumiOutputs.instanceId
        }

    }

    async doDestroy() {

        this.logger.info(`Destroying instance: ${this.args.instanceName}`)

        const confirmCreation = await confirm({
            message: `You are about to destroy runpod instance '${this.args.instanceName}'. Please confirm:`,
            default: false,
        });

        if (!confirmCreation) {
            throw new Error('Destroy aborted.');
        }

        const pulumiClient = new runpodPulumiClient(this.args.instanceName)
        await pulumiClient.destroy()

        this.args.output = undefined
        this.args.output = undefined
    }

    async doVerifyConfig() {
        const client = new runpodClient(this.args.instanceName, this.args.input.region)
        await client.checkAuth()
    }
}
