# Google Cloud account setup

If you don't already have a Google Cloud account, [create an account](https://console.cloud.google.com/) or use an existing account.

Configure your credentials locally ([see official documentation](https://cloud.google.com/sdk/docs/install))

Check your configuration:

```sh
$ gcloud auth list

Credentialed Accounts
ACTIVE  ACCOUNT
*       your_email@gmail.com
```

## Quotas

You may need to increase quota to create the desired instance type. If you get an error related to quota, see:
- [Google Cloud Quota doc](https://cloud.google.com/docs/quotas/view-manage) to update your quotas.
- [Your account Quota dashboard](https://console.cloud.google.com/quotas?project=_)