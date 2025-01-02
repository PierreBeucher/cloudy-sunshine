import { z } from "zod"
import { CommonProvisionOutputV1Schema, CommonProvisionInputV1Schema, InstanceStateV1Schema, AbstractInstanceInputs } from "../../core/state/state"
import { CLOUDYPAD_PROVIDER_runpod, PUBLIC_IP_TYPE_DYNAMIC, PUBLIC_IP_TYPE_STATIC } from "../../core/const"

const runpodProvisionOutputV1Schema = CommonProvisionOutputV1Schema.extend({
    instanceId: z.string().describe("runpod instance ID"),
})

const runpodProvisionInputV1Schema = CommonProvisionInputV1Schema.extend({
    instanceType: z.string().describe("Type of runpod instance"),
    diskSize: z.number().describe("Disk size in GB"),
    publicIpType: z.enum([PUBLIC_IP_TYPE_STATIC, PUBLIC_IP_TYPE_DYNAMIC]).describe("Type of public IP address"),
    region: z.string().describe("runpod region"),
    useSpot: z.boolean().describe("Whether to use spot instances"),
})

const runpodInstanceStateV1Schema = InstanceStateV1Schema.extend({
    provision: z.object({
        provider: z.literal(CLOUDYPAD_PROVIDER_runpod),
        output: runpodProvisionOutputV1Schema.optional(),
        input: runpodProvisionInputV1Schema,
    })
})

type runpodInstanceStateV1 = z.infer<typeof runpodInstanceStateV1Schema>
type runpodProvisionOutputV1 = z.infer<typeof runpodProvisionOutputV1Schema>
type runpodProvisionInputV1 = z.infer<typeof runpodProvisionInputV1Schema>

type runpodInstanceInput = AbstractInstanceInputs<runpodProvisionInputV1>

export {
    runpodProvisionOutputV1Schema,
    runpodProvisionInputV1Schema,
    runpodInstanceStateV1Schema,
    runpodInstanceStateV1,
    runpodProvisionOutputV1,
    runpodProvisionInputV1,
    runpodInstanceInput,
}

// V0

export interface runpodProvisionArgsV0 {
    create: {
        instanceType: string
        diskSize: number
        publicIpType: string
        region: string
        useSpot: boolean
    }
}

export interface runpodProviderStateV0 {
    instanceId?: string,
    provisionArgs?: runpodProvisionArgsV0
}