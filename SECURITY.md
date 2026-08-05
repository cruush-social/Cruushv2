# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing security@yourdomain.com. We will respond as quickly as possible to address the issue.

## Best Practices
- Never commit secrets or credentials to the repository.
- Use environment variables for sensitive data.
- Review dependencies for vulnerabilities regularly.
- Keep all dependencies up to date.
- Use 2FA for repository access.

## Production credentials that look like test ones

- **IAM user `cruush-rekognition-staging`** (AWS account 741180448899) is a **production**
  credential despite its name. It screens every profile and message photo through Amazon
  Rekognition. Deleting it during an AWS cleanup stops photo uploads for every user, because
  moderation fails closed: an image that cannot be screened is refused rather than published.
  To replace it, create a new IAM user, put its key on the `cruush-api` application in
  Coolify, confirm an upload succeeds, and only then delete the old user. Do not rename in
  place — anything referencing the old ARN would keep pointing at a name that no longer
  exists. `pnpm --dir server health:rekognition` verifies a key end to end, and a cron on
  the production host runs that probe every 30 minutes and emails the support inbox if it
  ever fails.

## Contact
For any security concerns, contact security@yourdomain.com.
