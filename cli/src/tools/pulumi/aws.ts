import * as fs from 'fs'
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { ConfigMap, InlineProgramArgs, LocalWorkspace, LocalWorkspaceOptions, OutputMap, PulumiFn, Stack } from "@pulumi/pulumi/automation";
import { InstancePulumiClient, PULUMI_BACKEND_URL, PULUMI_CONFIG_PASSPHRASE } from "./client";

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

interface CloudyPadEC2instanceArgs {
    vpcId?: pulumi.Input<string>;
    subnetId?: pulumi.Input<string>;
    ingressPorts?: PortDefinition[];
    publicKeyContent?: pulumi.Input<string>
    existingKeyPair?: pulumi.Input<string>
    tags?: pulumi.Input<{ [key: string]: pulumi.Input<string> }>
    ami: pulumi.Input<string>;
    type: pulumi.Input<string>;
    publicIpType?: pulumi.Input<string>;
    rootVolume?: {
        sizeGb?: pulumi.Input<number>;
        type?: pulumi.Input<string>;
        encrypted?: pulumi.Input<boolean>;
    }
    additionalVolumes?: VolumeArgs[]

    /**
     * Ignore changes to public key used to create instance.
     * This allow to pass any value to public key without destroying instance
     */
    ignorePublicKeyChanges?: pulumi.Input<boolean>
}

/**
 * Multiple replicas of CompositeEC2Instance
 */
class CloudyPadEC2Instance extends pulumi.ComponentResource {
    
    private readonly ec2Instance: aws.ec2.Instance
    private readonly volumes: aws.ebs.Volume[]
    private readonly keyPair?: aws.ec2.KeyPair
    private readonly securityGroup: aws.ec2.SecurityGroup
    private readonly eip?: aws.ec2.Eip
    private readonly keyPairName: pulumi.Output<string>

    /**
     * The Public IP provisioned for instance.
     * If publicIpType is static, will be the public EIP provisioned
     * Otherwise, will be the dynamic Public IP associated to instance at launchtime.
     */
    readonly publicIp: pulumi.Output<string>
    readonly instanceId: pulumi.Output<string>

    constructor(name: string, args: CloudyPadEC2instanceArgs, opts? : pulumi.ComponentResourceOptions) {
        super("crafteo:cloudypad:aws:ec2-instance", name, args, opts);

        const awsResourceNamePrefix = `CloudyPad-${name}`

        const globalTags = {
            ...args.tags,
            Name: awsResourceNamePrefix,
        }

        const commonPulumiOpts = {
            parent: this
        }

        this.securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
            vpcId: args.vpcId,
            ingress: args.ingressPorts?.map(p => {
                return { 
                    fromPort: p.from, 
                    toPort: p.to || p.from, 
                    protocol: p.protocol || "all", 
                    cidrBlocks: p.cidrBlocks || ["0.0.0.0/0"],
                    ipv6CidrBlocks: p.ipv6CirdBlocks || ["::/0"]
                }
            }),
            egress: [{
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
            }],
            name: awsResourceNamePrefix,
            tags: globalTags
        }, commonPulumiOpts);

        if (args.existingKeyPair && args.publicKeyContent) {
            throw new Error("existingKeyPair and publicKeyContent are mutually exclusive, only set one or the other.")
        } else if (args.publicKeyContent){
            this.keyPair = new aws.ec2.KeyPair(`${name}-keypair`, {
                publicKey: args.publicKeyContent,
                keyName: awsResourceNamePrefix
            }, {
                ...commonPulumiOpts,
                ignoreChanges: args.ignorePublicKeyChanges ? [ "publicKey" ] : []
            })

            this.keyPairName = this.keyPair.keyName
        } else if (args.existingKeyPair) {
            this.keyPairName = pulumi.output(args.existingKeyPair)
        } else {
            throw new Error("One of publicKeyContent or existingKeyPair is required")
        }
        

        this.ec2Instance = new aws.ec2.Instance(`${name}-ec2-instance`, {
            ami: args.ami,
            instanceType: args.type,
            tags:  {
                ...args.tags,
                Name: awsResourceNamePrefix
            },
            volumeTags: args.tags,
            vpcSecurityGroupIds: [this.securityGroup.id],
            keyName: this.keyPairName,
            rootBlockDevice: {
                encrypted:  args.rootVolume?.encrypted || true,
                volumeSize: args.rootVolume?.sizeGb,
                volumeType: args.rootVolume?.type
            },
            subnetId: args.subnetId,
            associatePublicIpAddress: true,
        }, {
            ...commonPulumiOpts,
            ignoreChanges: [
                "associatePublicIpAddress" 
            ]
        })

        this.volumes = []
        args.additionalVolumes?.forEach(v => {        
            const vol = new aws.ebs.Volume(`${name}-volume-${v.deviceName}`, {
                encrypted: v.encrypted || true,
                availabilityZone: v.availabilityZone || this.ec2Instance.availabilityZone,
                size: v.size,
                type: v.type,
                iops: v.iops,
                throughput: v.throughput,
                tags: globalTags
            }, commonPulumiOpts);
    
            new aws.ec2.VolumeAttachment(`${name}-volume-attach-${v.deviceName}`, {
                deviceName: v.deviceName,
                volumeId: vol.id,
                instanceId: this.ec2Instance.id,
            }, commonPulumiOpts);

            this.volumes.push(vol)
        })
        

        if (args.publicIpType === "static") {
            this.eip = new aws.ec2.Eip(`${name}-eip`, {
                tags: globalTags
            }, commonPulumiOpts);
                    
            new aws.ec2.EipAssociation(`${name}-eipAssoc`, {
                instanceId: this.ec2Instance.id,
                allocationId: this.eip.id,
            }, commonPulumiOpts);
        } else if (args.publicIpType !== "dynamic") {
            throw "publicIpType must be either 'static' or 'dynamic'"
        }

        // set client-facing values
        this.instanceId = this.ec2Instance.id
        this.publicIp = this.eip ? this.eip.publicIp : this.ec2Instance.publicIp
    }
}

async function awsPulumiProgram(): Promise<Record<string, any> | void> {

    const config = new pulumi.Config();
    const instanceType = config.require("instanceType");
    const rootVolumeSizeGB = config.requireNumber("rootVolumeSizeGB");
    const publicIpType = config.require("publicIpType");
    const publicKeyContent = config.require("publicSshKeyContent");

    const instanceName = pulumi.getStack()

    // TODO fixed version
    const ubuntuAmi = aws.ec2.getAmiOutput({
        mostRecent: true,
        filters: [
            {
                name: "name",
                values: ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"],
            },
            {
                name: "virtualization-type",
                values: ["hvm"],
            },
        ],
        owners: ["099720109477"],
    })

    const instance = new CloudyPadEC2Instance(instanceName, {
        ami: ubuntuAmi.imageId,
        type: instanceType,
        publicKeyContent: publicKeyContent,
        rootVolume: {
            type: "gp3",
            encrypted: true,
            sizeGb: rootVolumeSizeGB
        },
        publicIpType: publicIpType,
        ignorePublicKeyChanges: true,
        ingressPorts: [ // SSH + Wolf ports
            { from: 22, protocol: "tcp" }, // HTTP
            { from: 47984, protocol: "tcp" }, // HTTP
            { from: 47989, protocol: "tcp" }, // HTTPS
            { from: 48010, protocol: "tcp" }, // RTSP
            { from: 47999, protocol: "udp" }, // Control
            { from: 48100, to: 48110, protocol: "udp" }, // Video (up to 10 users)
            { from: 48200, to: 48210, protocol: "udp" }, // Audio (up to 10 users)
        ]
    })

    return {
        instanceId: instance.instanceId,
        publicIp: instance.publicIp
    }

}

export interface PulumiStackConfigAws {
    region: string
    instanceType: string
    rootVolumeSizeGB: number
    publicSshKeyContent: string
    publicIpType: string
}

export interface AwsPulumiOutput {
    instanceId: string
    publicIp: string
}

export class AwsPulumiClient extends InstancePulumiClient<PulumiStackConfigAws, AwsPulumiOutput> {

    constructor(stackName: string){
        super({ program: awsPulumiProgram, projectName: "CloudyPad-AWS", stackName: stackName})
    }

    async setConfig(config: PulumiStackConfigAws){
        this.logger.debug(`Setting stack ${this.stackName} config: ${JSON.stringify(config)}`)

        const stack = await this.getStack()
        await stack.setConfig("region", { value: config.region})
        await stack.setConfig("instanceType", { value: config.instanceType})
        await stack.setConfig("rootVolumeSizeGB", { value: config.rootVolumeSizeGB.toString()})
        await stack.setConfig("publicSshKeyContent", { value: config.publicSshKeyContent})
        await stack.setConfig("publicIpType", { value: config.publicIpType})

        const allConfs = await stack.getAllConfig()
        this.logger.debug(`Config after update: ${JSON.stringify(allConfs)}`)

    }

    protected async buildTypedOutput(outputs: OutputMap) : Promise<AwsPulumiOutput>{
        return {
            instanceId: outputs["instanceId"].value as string, // TODO validate with Zod
            publicIp: outputs["publicIp"].value as string
        }   
    }

}