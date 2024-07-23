import { select, input, password } from '@inquirer/prompts';
import { PartialDeep } from 'type-fest';
import { PaperspaceProvisionArgs } from './provisioner';
import { PaperspaceClient } from './client/client';
import { getLogger } from '../../log/utils';

export class PaperspaceInitializerPrompt {
    
    protected readonly logger = getLogger(PaperspaceInitializerPrompt.name)

    async prompt(opts?: PartialDeep<PaperspaceProvisionArgs>) : Promise<{ apiKey: string, args: PaperspaceProvisionArgs}> {
        
        const apiKey = await this.apiKey()

        const client = new PaperspaceClient({ name: PaperspaceInitializerPrompt.name, apiKey: apiKey, });
        const authResult = await client.authSession()

        this.logger.info(`Paperspace authenticated as ${authResult.user.email} (team: ${authResult.team.id})`)
        
        let useExisting: boolean
        if (opts?.useExisting) {
            useExisting = true
        } else {
            useExisting = await select({
                message: 'Do you want to use an existing machine or create a new one?',
                choices: [{
                    name: "Create a new machine",
                    value: false
                }, {
                    name: "Use an existing machine",
                    value: true
                }]
            });
        }

        if (useExisting) {
            const [machineId, publicIp] = await this.existingMachineId(client, opts?.useExisting?.machineId);
            
            return  { 
                apiKey: apiKey,
                args: {
                    useExisting: {
                        machineId: machineId,
                        publicIp: publicIp
                    }
                }
            }
            
        } else {
            const machineType = await this.machineType(opts?.create?.machineType);
            const diskSize = await this.diskSize(opts?.create?.diskSize);
            const publicIpType = await this.publicIpType(opts?.create?.publicIpType);
            const region = await this.region(opts?.create?.region);
            
            return {
                apiKey: apiKey,
                args: {
                    create: {
                        diskSize: diskSize,
                        machineType: machineType,
                        publicIpType: publicIpType,
                        region: region
                    }
                }
            }
        }

    }

    private async existingMachineId(client: PaperspaceClient, existingMachineId?: string) {
        if (existingMachineId) {
            return existingMachineId;
        }

        const existingMachines = await client.listMachines();
        const machineChoices = existingMachines.map(machine => ({
            name: `${machine.id} (${machine.name})`,
            value: machine.id,
        }));

        const selectedMachineId = await select({
            message: 'Select an existing Paperspace machine:',
            choices: machineChoices,
        });

        const selectedMachine = existingMachines.find(machine => machine.id === selectedMachineId);

        if (!selectedMachine) {
            throw new Error('Selected machine not found.');
        }

        if (!selectedMachine.publicIp) {
            throw new Error('Selected machine does not have a public IP address.');
        }

        return [ selectedMachineId, selectedMachine.publicIp ]
    }

    protected async machineType(machineType?: string): Promise<string> {
        if (machineType) {
            return machineType;
        }

        const choices = ['M4000', 'P4000', 'A4000', 'RTX4000', 'P5000', 'RTX5000', 'P6000', 'A5000', 'A6000' ].sort().map(type => ({ name: type, value: type }))
        choices.push({name: "Let me type an instance type", value: "_"})
        
        const selectedInstanceType = await select({
            message: 'Select machine type:',
            loop: false,
            choices: choices,
            default: "RTX4000"
        })

        if(selectedInstanceType === '_'){
            return await input({
                message: 'Enter machine type:',
            })
        }

        return selectedInstanceType
    }

    protected async diskSize(diskSize?: number): Promise<number> {
        if (diskSize) {
            return diskSize;
        }

        const selectedDiskSize = await select({
            message: 'Select disk size (GB):',
            choices: ['50', '100', '250', '500', '1000', '2000'].map(size => ({ name: size, value: size })),
        });

        return Number.parseInt(selectedDiskSize);
    }

    protected async publicIpType(publicIpType?: string): Promise<'static' | 'dynamic'> {
        if (publicIpType) {
            if (publicIpType !== 'static' && publicIpType !== 'dynamic') {
                throw new Error(`Unknown IP type ${publicIpType}, must be 'static' or 'dynamic'`)
            }
            return publicIpType;
        }
        
        // Use static for now
        // TODO let user choose ?
        return 'static';
    }

    protected async region(region?: string): Promise<string> {
        if (region) {
            return region;
        }

        return await select({
            message: 'Select region for new machine:',
            choices: ['East Coast (NY2)', 'West Coast (CA1)', 'Europe (AMS1)'].map(r => ({ name: r, value: r }))
        });
    }

    protected async apiKey(apiKey?: string): Promise<string>{
        if (apiKey) {
            this.logger.debug(`Using provided API key via.`)
            return apiKey
        } else if (process.env.PAPERSPACE_API_KEY) {
            this.logger.debug(`Using Paperspace API key via environment variable PAPERSPACE_API_KEY.`)
            return process.env.PAPERSPACE_API_KEY
        } else {
            return await password({
                message: 'No Paperspace API Key found. Restart with environment variable PAPERSPACE_API_KEY=<key> or enter API Key:'
            });
        }
    }

}