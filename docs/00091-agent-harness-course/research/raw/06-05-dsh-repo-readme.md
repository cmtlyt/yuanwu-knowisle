# 批次 06 · WebFetch · https://github.com/deepseek-ai/deepseek-harness

- 核实日期：2026-11-15
- 服务器时间：2026-11-15 19:45 GMT+8
- URL：https://github.com/deepseek-ai/deepseek-harness
- callId：call_2e6f038847da4f11a0fccc70
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写

---

**返回原文**

`````text
**标题**: GitHub - deepseek-ai/deepseek-harness: DeepSeek Harness: Everything is a Plugin. · GitHub

![imccyu](https://github.com/imccyu)imccyu

Merge pull request #8422 from deepseek-harness/worktree-sync-release-…

Nov 13, 2026

39163dd · Nov 13, 2026

[...]

## Folders and files

## Folders and files
Merge pull request: route Include-dialect YAML through Include exports") #7940 from deepseek-harness/refactor/cordis-includ…: route Include-dialect YAML through Include exports")

Nov 13, 2026

native

native

chore(deps): update source and build tools: update source and build tools")

Oct 7, 2026

packages

packages

Merge pull request: sync 0.2.2-rc.3 back to master") #8422 from deepseek-harness/worktree-sync-release-…: sync 0.2.2-rc.3 back to master")

Nov 13, 2026

## Folders and files
patches

patches

Merge master into feat/subagent-names

Oct 29, 2026

python

python

refactor(jobs,terminal): import HarnessError from dsh-error: import HarnessError from dsh-error  JobError and TerminalError only need the error base, so dsh-jobs and dsh-terminal depend on dsh-error instead of the LLM runtime. The Python SDK runtime closure includes the new package.  Refs #7869")

Nov 5, 2026

scripts

scripts

Merge pull request: route Include-dialect YAML through Include exports") #7940 from deepseek-harness/refactor/cordis-includ…: route Include-dialect YAML through Include exports")

Nov 13, 2026

snapshots

## Folders and files
snapshots

Merge branch 'release/dsh-0.2.2' into master

Nov 13, 2026

vendor

vendor

Merge pull request: route Include-dialect YAML through Include exports") #7940 from deepseek-harness/refactor/cordis-includ…: route Include-dialect YAML through Include exports")

Nov 13, 2026

website

website

[...]

## Folders and files
official review steps  * refactor(agent-preset): fold plugin artwork into cordis plugin development  * feat(agent-preset): require detail documents for creator bundles  * test(release): expect source and maps in master's new payload cases  * refactor(agent-preset): consolidate creator skills into dsh-doc  * feat(release): keep installed docs and source readable in Desktop  Desktop keeps the published src/ and docs/ trees inside app.asar, and every model shell call receives DSH_INSTALL_DIR and DSH_NODE_EXECUTABLE so an agent can read them through Electron's Node mode. Staging also generates docs/upgrade-guide/README.md, an index of the upgrade guides grouped by the release they upgrade from.  Minified client bundles print string literals with backticks: the worker image packer now recognizes those chunk requests, client license banners are prepended after minification so their text survives, and the affected artifact tests accept either quote.  * docs(agent-preset): add dsh-doc install, upgrade, and fallback guidance  * docs(agent-preset): align dsh-doc archive reads and upgrade start versions  * docs(agent-preset): bound dsh-doc upgrade index reads and test documented commands  * test(desktop): read archived docs through the Windows PowerShell form  Regenerate the config catalog for the shifted shell-env source line.  * docs(upgrade-guide): correct dsh-doc session verification step  * test(agent-preset): use a block body for dsh-doc fixture cleanup  * test(desktop): wait for the GUI-subsystem Electron process from PowerShell  * docs(agent-preset): read the running DSH version from the installation  * build(release): publish source and maps from the message-quotes package  * docs(agent-preset): document the verified PowerShell runtime invocation  * docs(agent-preset): keep PowerShell runtime output streams and exit code  * docs(tool-cordis): describe the shipped dsh-doc skill  * docs(skills):

[...]

## Folders and files
docs: simplify Chinese README community signup (  Co-authored-by: ag <ag@agdeMacBook-Pro.local>")#5311)  Co-authored-by: ag <ag@agdeMacBook-Pro.local>")

Sep 29, 2026

SAFETY.i18n.yaml

SAFETY.i18n.yaml

[...]

## Folders and files
Sep 23, 2026

SAFETY.md

SAFETY.md

Merge pull request #2560 from deepseek-harness/codex/add-security-policy

Aug 23, 2026

SAFETY.zh.md

SAFETY.zh.md

Merge pull request #2560 from deepseek-harness/codex/add-security-policy

Aug 23, 2026

THIRD_PARTY_NOTICES.md

THIRD_PARTY_NOTICES.md

[...]

## Folders and files
package.json

package.json

Merge branch 'release/dsh-0.2.2' into master

Nov 13, 2026

pnpm-lock.yaml

pnpm-lock.yaml

Merge pull request: route Include-dialect YAML through Include exports") #7940 from deepseek-harness/refactor/cordis-includ…: route Include-dialect YAML through Include exports")

Nov 13, 2026

pnpm-workspace.yaml

pnpm-workspace.yaml

[...]

# DeepSeek Harness



English | 中文

DeepSeek Harness (`dsh`) is an open-source agent harness developed by DeepSeek AI.

It is built on an **everything-is-a-plugin** architecture and powered by Cordis, whose design is described in *A Programming Paradigm for Spatiotemporal Composability*.

Documentation: https://deepseek-harness.github.io/deepseek-harness/

## Developer preview



DeepSeek Harness is in *developer preview* and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the safety notice before running the project.

## Run



### Run from `npm`npm



Install `Node.js`, then run:

```
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See Web UI guide.

### Run from source



To run from a repository checkout:

```
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support



- Submit feedback or bug reports through GitHub Discussions.
- Add the `dsh-plugin` topic to your plugin repository for discoverability.
- Join DeepSeek Harness Discord community.

## Contributing



See CONTRIBUTING.md.

## Development



Start with the development guide and architecture documentation.

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow AGENTS.md.

## Citation



```
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License



MIT

Third-party dependencies and their licenses are disclosed in THIRD_PARTY_NOTICES.md.
`````
