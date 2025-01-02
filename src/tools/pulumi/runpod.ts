import * as runpod from "@runpod-infra/pulumi";
import * as pulumi from "@pulumi/pulumi";
import { OutputMap } from "@pulumi/pulumi/automation";
import { InstancePulumiClient } from "./client";
import { PUBLIC_IP_TYPE, PUBLIC_IP_TYPE_DYNAMIC, PUBLIC_IP_TYPE_STATIC } from "../../core/const";

interface PortDefinition {
    from: pulumi.Input<number>,
    to?: pulumi.Input<number>,
    protocol?: pulumi.Input<string>,
    cidrBlocks?: pulumi.Input<string>[]
    ipv6CirdBlocks?: pulumi.Input<string>[]
}

interface VolumeArgs {
    size: pulumi.Input<number>;
    type?: pulumi.Input<string>;
    deviceName: string;
    encrypted?: pulumi.Input<boolean>;
    availabilityZone?: pulumi.Input<string>;
    iops?: pulumi.Input<number>;
    throughput?: pulumi.Input<number>;
}

interface CloudyPadGPUinstanceArgs {
    vpcId?: pulumi.Input<string>;
    subnetId?: pulumi.Input<string>;
    ingressPorts?: PortDefinition[];
    publicKeyContent?: pulumi.Input<string>
    existingKeyPair?: pulumi.Input<string>
    tags?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>
    ami: pulumi.Input<string>;
    type: pulumi.Input<string>;
    publicIpType?: pulumi.Input<string>
    rootVolume?: {
        sizeGb?: pulumi.Input<number>
        type?: pulumi.Input<string>
        encrypted?: pulumi.Input<boolean>
    }
    additionalVolumes?: VolumeArgs[]

    /**
     * Spot instance usage configuration
     */
    spot?: {

        /**
         * Whether to use spot instance
         */
        enabled?: pulumi.Input<boolean>
    }

    /**
     * Ignore changes to public key used to create instance.
     * This allow to pass any value to public key without destroying instance
     */
    ignorePublicKeyChanges?: pulumi.Input<boolean>
}

/**
 * Multiple replicas of CompositeEC2Instance
 */
class CloudyPadGPUInstance extends pulumi.ComponentResource {


    constructor(name: string, args: CloudyPadGPUinstanceArgs, opts?: pulumi.ComponentResourceOptions) {
        super("crafteo:cloudypad:runpod:ec2-instance", name, args, opts);

        const runpodResourceNamePrefix = `CloudyPad-${name}`

        const globalTags = {
            ...args.tags,
            Name: runpodResourceNamePrefix,
        }

        const commonPulumiOpts = {
            parent: this
        }


        const myTemplate = new runpod.Template("testTemplate", {
            containerDiskInGb: 5,
            dockerArgs: "python handler.py",
            env: [
                {
                    key: "key1",
                    value: "value1",
                },
                {
                    key: "key2",
                    value: "value2",
                },
            ],
            imageName: "runpod/serverless-hello-world:latest",
            isServerless: true,
            name: "Testing Pulumi V1",
            readme: "## Hello, World!",
            volumeInGb: 0,
        });

        const testNetworkStorage = new runpod.NetworkStorage("testNetworkStorage", {
            name: "testStorage1",
            size: 10,
            dataCenterId: "US-OR-1",
        });

        const myRandomPod = new runpod.Pod("myRandomPod", {
            cloudType: "ALL",
            networkVolumeId: testNetworkStorage.networkStorage.apply(
                // @ts-ignore
                (networkStorage) => networkStorage.id
            ),
            gpuCount: 1,
            volumeInGb: 50,
            containerDiskInGb: 50,
            minVcpuCount: 2,
            minMemoryInGb: 15,
            gpuTypeId: "NVIDIA GeForce RTX 4090",
            name: "RunPod Pytorch",
            imageName: "runpod/pytorch:latest",
            dockerArgs: "",
            ports: "8888/http",
            volumeMountPath: "/workspace",
            env: [
                {
                    key: "JUPYTER_PASSWORD",
                    value: "rns1hunbsstltcpad22d",
                },
            ],
        });

        const myRandomEndpoint = new runpod.Endpoint("myRandomEndpoint", {
            gpuIds: "AMPERE_16,AMPERE_24,-NVIDIA L4",
            idleTimeout: 100,
            locations: "CA-MTL-2,CA-MTL-3,EU-RO-1,US-CA-1,US-GA-1,US-KS-2,US-OR-1,CA-MTL-1,US-TX-3,EUR-IS-1,EUR-IS-2,SEA-SG-1",
            name: "myRandomEndpoint",
            networkVolumeId: testNetworkStorage.networkStorage.apply(
                // @ts-ignore
                (networkStorage) => networkStorage.id
            ),
            scalerType: 'REQUEST_COUNT',
            scalerValue: 2,
            templateId: myTemplate.template.apply(t => t.id),
            workersMax: 2,
            workersMin: 1,
        })

        export const template = {
            value: myTemplate.template,
        };

        export const endpoint = {
            value: myRandomEndpoint.endpoint,
        };

        export const pod = {
            value: myRandomPod.pod,
        };

        export const networkStorage = {
            value: testNetworkStorage.networkStorage,
        };
    }

 

 

 

export class RunPodPulumiClient extends InstancePulumiClient<PulumiStackConfigRunPod, RunPodPulumiOutput> {

    constructor(stackName: string) {
        super({ program: runpodPulumiProgram, projectName: "CloudyPad-AWS", stackName: stackName })
    }

    async doSetConfig(config: PulumiStackConfigRunPod) {
        this.logger.debug(`Setting stack ${this.stackName} config: ${JSON.stringify(config)}`)

        const stack = await this.getStack()
        await stack.setConfig("runpod:region", { value: config.region })
        await stack.setConfig("instanceType", { value: config.instanceType })
        await stack.setConfig("rootVolumeSizeGB", { value: config.rootVolumeSizeGB.toString() })
        await stack.setConfig("publicSshKeyContent", { value: config.publicSshKeyContent })
        await stack.setConfig("publicIpType", { value: config.publicIpType })
        await stack.setConfig("useSpot", { value: config.useSpot.toString() })

        const allConfs = await stack.getAllConfig()
        this.logger.debug(`Config after update: ${JSON.stringify(allConfs)}`)

    }

    protected async buildTypedOutput(outputs: OutputMap): Promise<RunPodPulumiOutput> {
        return {
            instanceId: outputs["instanceId"].value as string, // TODO validate with Zod
            publicIp: outputs["publicIp"].value as string
        }
    }

}