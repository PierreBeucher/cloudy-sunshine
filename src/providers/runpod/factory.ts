import { AbstractSubManagerFactory } from "../../core/manager";
import { InstanceProvisioner } from "../../core/provisioner";
import { InstanceRunner } from "../../core/runner";
import { runpodProvisioner } from "./provisioner";
import { runpodInstanceRunner } from "./runner";
import { runpodInstanceStateV1, runpodProvisionInputV1, runpodProvisionOutputV1 } from "./state";

export class runpodSubManagerFactory extends AbstractSubManagerFactory<runpodInstanceStateV1> {

    async doBuildProvisioner(name: string, input: runpodProvisionInputV1, output: runpodProvisionOutputV1): Promise<InstanceProvisioner> {
        return new runpodProvisioner({
            instanceName: name,
            input: input,
            output: output,
        })
    }

    async doBuildRunner(name: string, input: runpodProvisionInputV1, output: runpodProvisionOutputV1): Promise<InstanceRunner> {
        return new runpodInstanceRunner({
            instanceName: name,
            input: input,
            output: output,
        })
    }
}