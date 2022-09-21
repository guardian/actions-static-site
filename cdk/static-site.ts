import {
  GuDistributionBucketParameter,
  GuStack,
  GuStackProps,
} from "@guardian/cdk/lib/constructs/core";
import { App, Duration, SecretValue } from "aws-cdk-lib";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ListenerAction,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { GuVpc, SubnetType } from "@guardian/cdk/lib/constructs/ec2";
import { GuCname } from "@guardian/cdk/lib/constructs/dns/";
import { GuCertificate } from "@guardian/cdk/lib/constructs/acm";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { LambdaTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Port } from "aws-cdk-lib/aws-ec2";

interface StaticSiteProps extends GuStackProps {
  app: string;
  domainName: string;
  auth?: boolean;
  layerVersionName?: string; // Intended purely to stabilise for snapshot testing.
}

// It is surprisingly tricky in AWS to setup a static site, with a custom domain
// and Google authentication. The solution chosen here is as follows:
//
// ALB -> Lambda -> Layer
//
// where Google authentication is performed at the ALB level, and the site is
// served from the Lambda as a layer. The Lambda is a simple Go proxy to the
// layer.
//
// Users of this action should NOT assume that this architecture won't change
// going forward though.
//
// **Note:** layers have a size limit of 250mb. So your site cannot exceed this
// in size.
export class StaticSite extends GuStack {
  constructor(scope: App, id: string, props: StaticSiteProps) {
    super(scope, id, props);

    const bucket = Bucket.fromBucketName(
      this,
      `${id}-bucket`,
      GuDistributionBucketParameter.getInstance(this).valueAsString
    );

    const s3Prefix = `${this.stack}/${this.stage}/${props.app}`;

    const siteLayer = new LayerVersion(this, "site-layer", {
      code: Code.fromBucket(bucket, `${s3Prefix}/site.zip`),
      description: "layer for static site",
      layerVersionName:
        props.layerVersionName ??
        `site-layer-${Math.floor(new Date().getTime() / 1000)}`,
    });

    const lambda = new Function(this, "lambda", {
      runtime: Runtime.GO_1_X,
      handler: "main",
      code: Code.fromBucket(bucket, `${s3Prefix}/lambda.zip`),
      layers: [siteLayer],
    });

    const vpc = GuVpc.fromIdParameter(this, "vpc-id");
    const publicSubnets = GuVpc.subnetsFromParameter(this, {
      type: SubnetType.PUBLIC,
      app: props.app,
    });

    const alb = new ApplicationLoadBalancer(this, "alb", {
      vpc: vpc,
      vpcSubnets: { subnets: publicSubnets },
      internetFacing: true,
    });

    // Ensure ALB can reach ldp userInfo endpont - see
    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-troubleshooting.html#http-500-issues.
    alb.connections.allowToAnyIpv4(Port.tcp(443));

    new GuCname(this, "cname", {
      app: props.app,
      domainName: props.domainName,
      ttl: Duration.minutes(1),
      resourceRecord: alb.loadBalancerDnsName,
    });

    const cert = new GuCertificate(this, {
      app: props.app,
      domainName: props.domainName,
    });

    const listener = alb.addListener("listener", {
      protocol: ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [cert],
    });

    const targetGroup = listener.addTargets("target", {
      targets: [new LambdaTarget(lambda)],
    });
    targetGroup.setAttribute("lambda.multi_value_headers.enabled", "true"); // See: https://github.com/akrylysov/algnhsa/pull/20/files#diff-b335630551682c19a781afebcf4d07bf978fb1f8ac04c6bf87428ed5106870f5R81.

    if (props.auth) {
      const ssmPrefix = `${this.stage}/${this.stack}/${props.app}`;
      const clientId = StringParameter.fromStringParameterAttributes(
        this,
        "clientID",
        { parameterName: `/${ssmPrefix}/googleClientID` }
      ).stringValue;

      // Secure SSM Parameters here aren't possible unfortunately
      // (Cloudformation only provides narrow support for them at the time of
      // writing). See:
      // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references.html#template-parameters-dynamic-patterns-resources.
      const clientSecret = SecretValue.secretsManager(
        `${ssmPrefix}/googleClientSecret`
      );

      const authAction = ListenerAction.authenticateOidc({
        next: ListenerAction.forward([targetGroup]),

        clientId: clientId,
        clientSecret: clientSecret,

        scope: "openid email",

        // See the `hd` section of https://developers.google.com/identity/protocols/oauth2/openid-connect#authenticationuriparameters.
        authenticationRequestExtraParams: { hd: "guardian.co.uk" },

        authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        issuer: "https://accounts.google.com",
        tokenEndpoint: "https://oauth2.googleapis.com/token",
        userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      });

      listener.addAction("auth", { action: authAction });
    }
  }
}
