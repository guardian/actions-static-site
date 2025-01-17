import * as fs from 'fs';
import * as url from 'node:url';
import * as core from '@actions/core';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { StaticSite } from './cdk/static-site';

export const main = (): void => {
	const app = core.getInput('app', { required: true });
	const domain = core.getInput('domain', { required: true });

	const stack = 'deploy';

	core.info('Inputs are: ' + JSON.stringify({ app, stack, domain }));

	const cdkApp = new App();
	const cdkStack = new StaticSite(cdkApp, 'static-site', {
		app,
		stack,
		stage: 'PROD',
		domainName: domain,
	});

	const cfn = Template.fromStack(cdkStack).toJSON();
	fs.writeFileSync('cfn.json', JSON.stringify(cfn, undefined, 2));
};

try {
	// execute only if invoked as main script (rather than test)
	if (import.meta.url.startsWith('file:')) {
		// (A)
		const modulePath = url.fileURLToPath(import.meta.url);
		if (process.argv[1] === modulePath) {
			// (B)
			// Main ESM module
			main();
		}
	}
} catch (e) {
	const error = e as Error;
	core.error(error);
	core.setFailed(error.message);
}
