import { GuEc2App } from '@guardian/cdk';
import { AccessScope } from "@guardian/cdk/lib/constants";
import type {
  GuStackProps} from "@guardian/cdk/lib/constructs/core";
import {
  GuAnghammaradTopicParameter,
  GuDistributionBucketParameter,
  GuStack
} from "@guardian/cdk/lib/constructs/core";
import { GuCname } from "@guardian/cdk/lib/constructs/dns/";
import type { App} from "aws-cdk-lib";
import { Duration, SecretValue } from "aws-cdk-lib";
import { InstanceClass, InstanceSize, InstanceType } from "aws-cdk-lib/aws-ec2";
import {
  ListenerAction,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { ParameterTier, StringParameter } from "aws-cdk-lib/aws-ssm";

interface InfraProps extends GuStackProps {
  app: string;
  domainName: string;
}

// It is surprisingly tricky in AWS to setup a static site, with a custom domain
// and Google authentication. The solution chosen here is as follows:
//
// - a shared ALB, EC2, and bucket for *all* static sites
//
// Separately to this stack, each site will, in its own stack:
//
// - register a domain pointing to the ALB and a certificate registered
// - upload S3 files to the shared S3 bucket using it's own domain as key prefix
//   for the files
//
// E.g. files for devx-docs.gutools.co.uk live under:
//
//   /devx-docs.gutools.co.uk/index.html
//   /devx-docs.gutools.co.uk/styles.css
//
// etc.
export class Infra extends GuStack {
  constructor(scope: App, id: string, props: InfraProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, "static", {
      websiteIndexDocument: 'index.html',
    })
/*
    const vpc = GuVpc.fromIdParameter(this, "vpc-id");
    const publicSubnets = GuVpc.subnetsFromParameter(this, {
      type: SubnetType.PUBLIC,
      app: props.app,
    }); */


    // Required for the cert unfortunately.
/*     new GuCname(this, "cname", {
      app: props.app,
      domainName: props.domainName,
      ttl: Duration.days(1),
      resourceRecord: alb.loadBalancerDnsName,
    });

    // A placeholder cert, required but won't be used.
    const cert = new GuCertificate(this, {
      app: props.app,
      domainName: props.domainName,
    });

    // We need a default listener. The cert here will be unused - as sites will
    // register their own ones.
    const listener = alb.addListener("listener", {
      protocol: ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [cert],
    }); */

		const app = props.app;
		const keyPrefix = `${this.stack}/${this.stage}/${app}`;
    const port = 9000;
		const distBucket = GuDistributionBucketParameter.getInstance(this).valueAsString;

		const userData = `#!/bin/bash -ev
cat << EOF > /etc/systemd/system/${app}.service
[Unit]
Description=CDK Metadata

[Service]
Environment="PORT=${port}"
ExecStart=/${app}

[Install]
WantedBy=multi-user.target
EOF

aws s3 cp s3://${distBucket}/${keyPrefix}/${app} /${app}
chmod +x /${app}
systemctl start ${app}
`;

		const ec2 = new GuEc2App(this, {
			app: app,
			access: {
				scope: AccessScope.PUBLIC, // But note, Google auth required.
			},
			instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.NANO),
			applicationPort: port,
			monitoringConfiguration: {
				snsTopicName:
					GuAnghammaradTopicParameter.getInstance(this).valueAsString,
				unhealthyInstancesAlarm: true,
				http5xxAlarm: {
					tolerated5xxPercentage: 1,
					numberOfMinutesAboveThresholdBeforeAlarm: 60,
				},
			},
			certificateProps: { domainName: props.domainName },
			scaling: { minimumInstances: 1, maximumInstances: 2 },
			userData: userData,
			imageRecipe: 'arm64-bionic-java11-deploy-infrastructure',
			applicationLogging: { enabled: true },
      googleAuth: {
        clientId: 'TODO',
      }
		});

    bucket.grantRead(ec2.autoScalingGroup)

		new GuCname(this, 'DNS', {
			app: app,
			domainName: props.domainName,
			resourceRecord: ec2.loadBalancer.loadBalancerDnsName,
			ttl: Duration.hours(1),
		});

    const ssmPrefix = `${this.stage}/${this.stack}/${props.app}`;

    // TODO set ALB and bucket as SSM parameters
    new StringParameter(this, 'static-site-bucket', {
      description: 'Bucket for static sites.',
      parameterName: `${ssmPrefix}/bucket}`,
      stringValue: bucket.bucketName,
    });

    new StringParameter(this, 'static-site-alb-dns-name', {
      description: 'ALB DNS name for static sites.',
      parameterName: `${ssmPrefix}/loadBalancerDnsName}`,
      stringValue: ec2.loadBalancer.loadBalancerDnsName,
    });

  }
}
