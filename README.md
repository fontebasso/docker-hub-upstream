# Docker Hub Upstream

This project leverages GitHub Actions to monitor updates to Docker images and automatically perform a commit and release on your project. By tracking changes to the images, developers can ensure that the latest and most secure versions are used in their applications without the need for manual intervention.

## Inputs

### `token`

**Required** The Personal Access Token.

Generate token here: https://github.com/settings/tokens

### `image`

**Required** The name of the docker image. Default `"null"`.

### `tag`

The docker image tag to monitor. Default `"latest"`.

## Outputs

### `update`

The boolean value indicating whether the image was updated.

### `tag`

The tag of the latest image.

### `updated_at`

The date and time the image was last updated.

## Example usage

```yaml
uses: docker-hub-upstream@v1
with:
  image: 'library/alpine'
  tag: '3.16'
```

In the example above, every alpine 3.16 tag version release triggers a commit to versioning and publishes a release of its own

## Example workflow

```yaml
on:
  schedule:
    - cron: '0 */12 * * *' # every 12 hours
  push:
    branches:
      - main
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 0
    - name: Update Docker image
      uses: fontebasso/docker-hub-upstream@v1
      with:
        token: ${{ secrets.MY_TOKEN }}
        image: 'library/alpine'
        tag: '3.16'
