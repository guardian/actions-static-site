import { GuEc2App } from '@guardian/cdk';
import { AccessScope } from '@guardian/cdk/lib/constants';
import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import {
	GuAnghammaradTopicParameter,
	GuDistributionBucketParameter,
	GuStack,
} from '@guardian/cdk/lib/constructs/core';
import { GuCname } from '@guardian/cdk/lib/constructs/dns/';
import { GuVpc } from '@guardian/cdk/lib/constructs/ec2';
import { GuS3Bucket } from '@guardian/cdk/lib/constructs/s3';
import { GuardianAwsAccounts } from '@guardian/private-infrastructure-config';
import type { App } from 'aws-cdk-lib';
import { Duration, SecretValue } from 'aws-cdk-lib';
import {
	InstanceClass,
	InstanceSize,
	InstanceType,
	SecurityGroup,
} from 'aws-cdk-lib/aws-ec2';
import {
	ListenerAction,
	ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
	AccountPrincipal,
	ArnPrincipal,
	PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

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

		const app = props.app;
		const bucket = new GuS3Bucket(this, 'static', {
			websiteIndexDocument: 'index.html',
			app,
		});

		this.overrideLogicalId(bucket, {
			logicalId: 'staticD8C87B36',
			reason:
				'Retaining a stateful resource previously defined as a Bucket, not a GuS3Bucket',
		});

		const keyPrefix = `${this.stack}/${this.stage}/${app}`;
		const port = 9000;
		const distBucket =
			GuDistributionBucketParameter.getInstance(this).valueAsString;

		const userData = `#!/bin/bash -ev
cat << EOF > /etc/systemd/system/${app}.service
[Unit]
Description=Static Site service

[Service]
Environment="BUCKET=${bucket.bucketName}"
Environment="PORT=${port}"
ExecStart=/${app}

[Install]
WantedBy=multi-user.target
EOF

aws s3 cp s3://${distBucket}/${keyPrefix}/static-site-service /${app}
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
		});

		// Need to give the ALB outbound access on 443 for the IdP endpoints.
		const sg = new SecurityGroup(this, 'ldp-access', {
			vpc: GuVpc.fromIdParameter(this, 'vpc', {}),
			allowAllOutbound: true,
		});

		ec2.loadBalancer.addSecurityGroup(sg);

		bucket.grantRead(ec2.autoScalingGroup);

		// Google Auth stuff...

		const configPrefix = `/${this.stage}/${this.stack}/${app}`;
		const clientIdPath = `${configPrefix}/googleClientID`;

		const clientId = StringParameter.fromStringParameterAttributes(
			this,
			'clientID',
			{
				parameterName: clientIdPath,
			},
		).stringValue;

		// Unfortunately, Cloudformation doesn't support directly using secret
		// Parameter Store values. But it is possible to use Secrets Manager.
		const secretPath = `${configPrefix}/clientSecret`;
		const clientSecret = SecretValue.secretsManager(secretPath);

		const authAction = ListenerAction.authenticateOidc({
			next: ListenerAction.forward([ec2.targetGroup]),
			clientId: clientId,
			clientSecret: clientSecret,
			scope: 'openid email',

			// See the `hd` section of
			// https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters.
			// Note, this is NOT sufficient to ensure access is limited to Guardian
			// emails. Users should also validate the token and check the domain in
			// their app.
			authenticationRequestExtraParams: { hd: 'guardian.co.uk' },

			authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
			issuer: 'https://accounts.google.com',
			tokenEndpoint: 'https://oauth2.googleapis.com/token',
			userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
		});

		ec2.listener.addTargetGroups('PRout', {
			priority: 1,
			conditions: [ListenerCondition.pathPatterns(['**/_prout'])],
			targetGroups: [ec2.targetGroup],
		});
		ec2.listener.addAction('auth', { action: authAction });

		new GuCname(this, 'DNS', {
			app: app,
			domainName: props.domainName,
			resourceRecord: ec2.loadBalancer.loadBalancerDnsName,
			ttl: Duration.hours(1),
		});

		// Used in the riff-raff.yaml of static sites to determine the bucket to
		// upload resources to.
		new StringParameter(this, 'static-site-bucket', {
			description: 'Bucket for static sites.',
			parameterName: `${configPrefix}/bucket`,
			stringValue: bucket.bucketName,
		});

		// Used by static site Cloudformations to attach certs.
		new StringParameter(this, 'static-site-alb-dns-name', {
			description: 'ALB DNS name for static sites.',
			parameterName: `${configPrefix}/loadBalancerDnsName`,
			stringValue: ec2.loadBalancer.loadBalancerDnsName,
		});

		new StringParameter(this, 'static-site-lisener-arn', {
			description: 'Listener ARN for static sites.',
			parameterName: `${configPrefix}/listenerArn`,
			stringValue: ec2.listener.listenerArn,
		});

		// Grant access to allow Galaxies data-refresher-lambda to write to relevant portion of the bucket
		// https://github.com/guardian/galaxies
		Object.values({
			PROD: {
				prefix: 'galaxies.gutools.co.uk/data/*',
				principals: [
					new ArnPrincipal(
						`arn:aws:iam::${GuardianAwsAccounts.DeveloperPlayground}:role/galaxies-data-refresher-lambda-role-PROD`,
					),
				],
			},
			CODE: {
				prefix: 'galaxies.code.dev-gutools.co.uk/data/*',
				principals: [
					new AccountPrincipal(GuardianAwsAccounts.DeveloperPlayground), // for local development
					new ArnPrincipal(
						`arn:aws:iam::${GuardianAwsAccounts.DeveloperPlayground}:role/galaxies-data-refresher-lambda-role-CODE`,
					),
				],
			},
		}).forEach(({ principals, prefix }) => {
			bucket.addToResourcePolicy(
				new PolicyStatement({
					resources: [bucket.arnForObjects(prefix)],
					actions: ['s3:PutObject'],
					principals: principals,
				}),
			);
			bucket.addToResourcePolicy(
				new PolicyStatement({
					resources: [bucket.bucketArn],
					actions: ['s3:ListBucket'],
					principals: principals,
					conditions: {
						StringLike: {
							's3:prefix': [prefix],
						},
					},
				}),
			);
		});
	}
}
