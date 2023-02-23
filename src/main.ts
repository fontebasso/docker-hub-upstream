import * as fs from 'fs'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as shell from '@actions/exec'
import fetch from 'node-fetch'

async function run(): Promise<void> {
  const inputImage = core.getInput('image')
  const tag = core.getInput('tag')
  if (await checkImageDockerName(inputImage)) {
    const image = await transformImageNameOfficial(inputImage)
    const localImage = await getLocalImage(image)
    const dockerHubImage = await getDockerHubVersion(image, tag)
    if (localImage.updated_at !== dockerHubImage.updated_at) {
      core.setOutput('update', true)
      core.setOutput('tag', dockerHubImage.tag)
      core.setOutput('updated_at', dockerHubImage.updated_at)
      await updateLocalImage(
        inputImage,
        dockerHubImage.tag,
        dockerHubImage.updated_at
      )
      const branchName = `update-docker-image-versions-${Date.now()}`
      await commitChanges(branchName)
      const pullRequest = await createPullRequest(branchName)
      await mergePullRequest(pullRequest)
      await deleteBranch(branchName)
      console.log('Branch deleted')
      const version = await getLastedPublishedVersion()
      console.log(`Lasted published version: ${version}`)
      const newVersion = await increaseMinorPatchVersion(version)
      console.log(`New version: ${newVersion}`)
      await publishRelease(newVersion)
    } else {
      core.setOutput('update', false)
    }
  } else {
    core.setFailed('Invalid image name')
  }
}

async function checkImageDockerName(image: string): Promise<boolean> {
  const regex = new RegExp(
    /^([a-z0-9]+[._-]?)+[a-z0-9]+\/([a-z0-9]+[._-]?)+[a-z0-9]+$/
  )
  return regex.test(image)
}

async function transformImageNameOfficial(image: string): Promise<string> {
  const [owner, name] = image.split('/')
  if (owner === '_') {
    return `library/${name}`
  }
  return image
}

async function getLocalImage(
  image: string
): Promise<{tag: any; updated_at: any}> {
  if (fs.existsSync('docker-image-versions.json')) {
    const content = fs.readFileSync('docker-image-versions.json', 'utf8')
    const versions = JSON.parse(content)
    if (versions[image]) {
      return {tag: versions[image].tag, updated_at: versions[image].updated_at}
    }
  }
  return {tag: null, updated_at: null}
}

async function updateLocalImage(
  image: string,
  tag: string,
  updated_at: string
): Promise<void> {
  let versions = {[image]: {tag, updated_at}}

  if (fs.existsSync('docker-image-versions.json')) {
    const content = fs.readFileSync('docker-image-versions.json', 'utf8')
    versions = JSON.parse(content)
    // @ts-ignore
    versions[image] = {
      tag,
      updated_at
    }
  }

  fs.writeFileSync('docker-image-versions.json', JSON.stringify(versions))
}

async function getDockerHubVersion(
  image: string,
  tag: string
): Promise<{tag: string; updated_at: string}> {
  const url = `https://hub.docker.com/v2/repositories/${image}/tags/${tag}`
  const response = await fetch(url)
  const json = (await response.json()) as any
  return {tag: json.name, updated_at: json.last_updated}
}

async function commitChanges(branchName: string): Promise<void> {
  await shell.exec('git config --global user.name "github-actions[bot]"')
  await shell.exec(
    'git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"'
  )
  await shell.exec(`git checkout -b ${branchName}`)
  await shell.exec('git add docker-image-versions.json')
  await shell.exec(`git commit -m "Update docker image versions"`)
  await shell.exec(`git push origin ${branchName}`)
}

async function createPullRequest(branchName: string): Promise<number> {
  const octokit = github.getOctokit(core.getInput('token'))
  const {owner, repo} = github.context.repo
  const pullRequest = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `Update docker image versions`,
    head: branchName,
    base: 'main',
    body: `Update docker image versions`,
    maintainer_can_modify: true
  })
  core.setOutput('pull_request', pullRequest.data.number)
  return pullRequest.data.number
}

async function mergePullRequest(pullRequest: number): Promise<void> {
  const octokit = github.getOctokit(core.getInput('token'))
  const {owner, repo} = github.context.repo
  await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: pullRequest
  })
}

async function deleteBranch(branchName: string): Promise<void> {
  const octokit = github.getOctokit(core.getInput('token'))
  const {owner, repo} = github.context.repo
  await octokit.rest.git.deleteRef({
    owner,
    repo,
    ref: `heads/${branchName}`
  })
}

async function getLastedPublishedVersion(): Promise<string> {
  const octokit = github.getOctokit(core.getInput('token'))
  const {owner, repo} = github.context.repo
  const releases = await octokit.rest.repos.listReleases({
    owner,
    repo
  })
  if (releases.data.length > 0) {
    return releases.data[0].tag_name
  }
  return '0.0.0'
}

async function increaseMinorPatchVersion(version: string): Promise<string> {
  const [major, minor, patch] = version.split('.')
  return `${major}.${minor}.${parseInt(patch) + 1}`
}

async function publishRelease(version: string): Promise<void> {
  const octokit = github.getOctokit(core.getInput('token'))
  const {owner, repo} = github.context.repo
  await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: version,
    name: version,
    body: `Release ${version}`
  })
}

run()
