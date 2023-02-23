import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'
import {expect, test} from '@jest/globals'

test('test runs', async () => {
  process.env['INPUT_TOKEN'] = '1234567890'
  process.env['INPUT_IMAGE'] = 'node'
  process.env['INPUT_TAG'] = 'latest'
  const np = process.execPath
  const script = path.join(__dirname, '..', 'src', 'main.ts')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [script], options).toString())
})
