export const CLOUDYPAD_PROVIDER_AWS = "aws"
export const CLOUDYPAD_PROVIDER_PAPERSPACE = "paperspace"
export const CLOUDYPAD_PROVIDER_AZURE = "azure"
export const CLOUDYPAD_PROVIDER_RUNPOD = "runpod"
export const CLOUDYPAD_PROVIDER_GCP = "gcp"
export type CLOUDYPAD_PROVIDER = typeof CLOUDYPAD_PROVIDER_RUNPOD | typeof CLOUDYPAD_PROVIDER_AWS | typeof CLOUDYPAD_PROVIDER_PAPERSPACE | typeof CLOUDYPAD_PROVIDER_AZURE | typeof CLOUDYPAD_PROVIDER_GCP
export const CLOUDYPAD_PROVIDER_LIST = [CLOUDYPAD_PROVIDER_RUNPOD, CLOUDYPAD_PROVIDER_AWS, CLOUDYPAD_PROVIDER_PAPERSPACE, CLOUDYPAD_PROVIDER_AZURE, CLOUDYPAD_PROVIDER_GCP] as const

export const CLOUDYPAD_CONFIGURATOR_ANSIBLE = "ansible"
export const CLOUDYPAD_CONFIGURATOR_LIST = [CLOUDYPAD_CONFIGURATOR_ANSIBLE] as const

/**
 * Most Cloud providers provide either static or dynamic IP.
 * Use this string to represent satic IP type.
 */
export const PUBLIC_IP_TYPE_STATIC = "static"

/**
 * Most Cloud providers provide either static or dynamic IP.
 * Use this string to represent dynamic IP type.
 */
export const PUBLIC_IP_TYPE_DYNAMIC = "dynamic"

/**
 * Most Cloud providers provide either static or dynamic IP.
 * Use this string to represent IP type.
 */
export type PUBLIC_IP_TYPE = typeof PUBLIC_IP_TYPE_DYNAMIC | typeof PUBLIC_IP_TYPE_STATIC