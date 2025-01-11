# Azure account setup

If you don't already have an Azure account, [create an account](https://account.azure.com/signup?showCatalog%20=%20True) or use an existing account.

Configure your credentials locally ([see official documentation](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli-interactively))

Check your configuration:

```sh
$ az account list
[
  {
    "cloudName": "AzureCloud",
    "homeTenantId": "xxx",
    "id": "xxx",
    "isDefault": true,
    "managedByTenants": [],
    "name": "My Azure Subcription",
    "state": "Enabled",
    "tenantId": "xxx",
    "user": {
      "name": "you@example.com",
      "type": "user"
    }
  }
]
```

## Quotas

You may need to increase quota to create the desired instance type. If you get an error related to quota:
- Go to [Azure Quota dashboard](https://portal.azure.com/#view/Microsoft_Azure_Capacity/QuotaMenuBlade/~/overview) (or search for "Quota" in the Azure portal)
- Go to _Compute_ > filter for your Subscription / Location and search for _NC_, _NC_ or the instance type prefix you want to use
- Click on quota name and _New Quota Request_
- Fill-out the quota request and submit

Quota is usually accepted within 24 to 48h.

See:
- [Azure Quota doc](https://learn.microsoft.com/en-us/azure/quotas/quotas-overview)
- [Your Azure quota dashboard](https://portal.azure.com/#view/Microsoft_Azure_Capacity/QuotaMenuBlade/~/overview)

### Google Cloud

If you don't already have a Google Cloud account, [create an account](https://console.cloud.google.com/) or use an existing account.

Configure your credentials locally ([see official documentation](https://cloud.google.com/sdk/docs/install))

Check your configuration:

```sh
$ gcloud auth list

Credentialed Accounts
ACTIVE  ACCOUNT
*       your_email@gmail.com
```

#### Quotas

You may need to increase quota to create the desired instance type. If you get an error related to quota, see [Google Cloud Quota doc](https://cloud.google.com/docs/quotas/view-manage) to update your quotas.