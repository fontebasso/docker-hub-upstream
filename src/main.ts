import * as fs from 'fs'
import {exec} from 'child_process'
import * as core from '@actions/core'
import github from '@actions/github'

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
      await createNewBranch(branchName)
      await commitChanges()
      await pushChanges(branchName)
      const pullRequest = await createPullRequest(branchName)
      await mergePullRequest(pullRequest)
      await deleteBranch(branchName)
      const version = await getLastedPublishedVersion()
      const newVersion = await increaseMinorPatchVersion(version)
      await publishRelease(newVersion)
    } else {
      core.setOutput('update', false)
    }
  } else {
    core.setFailed('Invalid image name')
  }
}

async function createNewBranch(branchName: string): Promise<void> {
  exec(`git checkout -b ${branchName}`, (error, stdout, stderr) => {
    if (error) {
      core.setFailed(error.message)
    }
    if (stderr) {
      core.setFailed(stderr)
    }
  })
}

async function commitChanges(): Promise<void> {
  exec(`git add .`, (error, stdout, stderr) => {
    if (error) {
      core.setFailed(error.message)
    }
    if (stderr) {
      core.setFailed(stderr)
    }
  })
  exec(
    `git commit -m "Update docker image versions"`,
    (error, stdout, stderr) => {
      if (error) {
        core.setFailed(error.message)
      }
      if (stderr) {
        core.setFailed(stderr)
      }
    }
  )
}

async function pushChanges(branchName: string): Promise<void> {
  exec(`git push origin ${branchName}`, (error, stdout, stderr) => {
    if (error) {
      core.setFailed(error.message)
    }
    if (stderr) {
      core.setFailed(stderr)
    }
  })
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
  return `${major}.${parseInt(minor) + 1}.${parseInt(patch) + 1}`
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
  let versions = {'${image}': {tag, updated_at}}

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
  const json = await response.json()
  return {tag: json.name, updated_at: json.last_updated}
}

run()
