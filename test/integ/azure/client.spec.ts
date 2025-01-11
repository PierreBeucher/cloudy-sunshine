import * as assert from 'assert'
import { AzureClient } from '../../../src/tools/azure'
import { AZURE_SUPPORTED_GPU } from '../../../src/providers/azure/cli'

describe('AzureClient', () => {
    let client = new AzureClient('AzureClientTest', "0dceb5ed-9096-4db7-b430-2609e7cc6a15")
    
    describe('getQuota', () => {
        it('should return quota standardNDSFamily without error', async () => {
            const quota = await client.getComputeQuota("standardNDSFamily", "francecentral")
            assert.equal(quota !== undefined && quota >= 0, true)
        }).timeout(10000)

        it('should return quota lowPriorityCores without error', async () => {
            const quota = await client.getComputeQuota("lowPriorityCores", "francecentral")
            assert.equal(quota !== undefined && quota >= 0, true)
        }).timeout(10000)
        
        it('should find quota for all supported GPU types', async () => {
            const allQuotas = new Set(AZURE_SUPPORTED_GPU.map(gpuType => gpuType.quotaName))

            for(const quota of allQuotas) {
                console.info(`Getting quota ${quota}`)
                const quotaValue = await client.getComputeQuota(quota, "francecentral")
                assert.equal(quotaValue !== undefined && quotaValue >= 0, true)
            }
        }).timeout(60000)
    })

    describe('listMachineSizes', () => {
        it('should return list of machine sizes without error', async () => {
            const sizes = await client.listMachineSizes("francecentral")
            assert.equal(sizes.length > 0, true)
        }).timeout(60000)
    })
})