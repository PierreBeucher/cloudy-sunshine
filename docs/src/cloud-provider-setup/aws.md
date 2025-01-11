# AWS account setup

If you don't already have an AWS account, [create an account](https://signin.aws.amazon.com/signup?request_type=register) or use an existing account.

Configure your credentials locally ([see official documentation](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html))

Check your configuration:

```sh
$ aws sts get-caller-identity
{
    "UserId": "AID...YOUR_USER_ID",
    "Account": "123456789",
    "Arn": "arn:aws:iam::123456789:user/crafteo"
}
```

You're good to go ! Create your instance with

```sh
cloudypad create
```

#### Quotas

You may need to increase quota to create the related instance type. If you get an error related to quota:
- Go to [AWS EC2 quota console](https://us-east-1.console.aws.amazon.com/servicequotas/home/services/ec2/quotas) (or search for "Quota" in the AWS console and go to _Amazon Elastic Compute Cloud (Amazon EC2)_ quota page)
- For Spot instances: search for _All G and VT Spot Instance Requests_ (or the related instance type) and request a quota increase
- For On-Demand instances: search for _Running On-Demand G and VT instances_ (or the related instance type) and request a quota increase
- Use a quota value according to the instance type you want to use. For example, `2xlarge` requires at least 8 vCPU.

See [AWS service quotas](https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html) for details.
