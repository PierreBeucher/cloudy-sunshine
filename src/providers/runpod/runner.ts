import { AbstractInstanceRunner, InstanceRunnerArgs } from '../../core/runner';
import { runpodClient } from '../../tools/runpod';
import { runpodProvisionInputV1, runpodProvisionOutputV1 } from './state';

export type runpodInstanceRunnerArgs = InstanceRunnerArgs<runpodProvisionInputV1, runpodProvisionOutputV1>

export class runpodInstanceRunner extends AbstractInstanceRunner<runpodProvisionInputV1, runpodProvisionOutputV1> {

    private runpodClient: runpodClient

    constructor(args: runpodInstanceRunnerArgs) {
        super(args)

        this.runpodClient = new runpodClient(args.instanceName, args.input.region)
    }

    private getInstanceId() {
        return this.args.output.instanceId
    }

    async doStart() {
        const instanceId = this.getInstanceId()
        await this.runpodClient.startInstance(instanceId)
    }

    async doStop() {
        const instanceId = this.getInstanceId()
        await this.runpodClient.stopInstance(instanceId)
    }

    async doRestart() {
        const instanceId = this.getInstanceId()
        await this.runpodClient.restartInstance(instanceId)
    }
}