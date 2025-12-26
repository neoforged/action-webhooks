import {GitHub} from "@actions/github/lib/utils";

import {getInput, setFailed} from '@actions/core';
import {context, getOctokit} from '@actions/github';
import axios from "axios";

enum Status {
    started, success, failed, cancelled, timedout
}

const colors = new Map<Status, number>()
colors[Status.started] = 0xDBAB0A
colors[Status.success] = 0x3FB950
colors[Status.failed] = 0xF85149
colors[Status.cancelled] = 0x7D8590
colors[Status.timedout] = 0xF48381

const userFriendlyName = new Map<Status, string>()
userFriendlyName[Status.started] = "Started"
userFriendlyName[Status.success] = "Successful"
userFriendlyName[Status.failed] = "Failed"
userFriendlyName[Status.timedout] = "Timed Out"
userFriendlyName[Status.cancelled] = "Cancelled"

export async function run(): Promise<any> {
    try {
        const octo: InstanceType<typeof GitHub> = getOctokit(getInput("github_token"));
        const lastCommit = await octo.rest.repos.getCommit({
            ...context.repo,
            ref: context.sha
        })

        const status = getStatus(getInput("status"))

        const fields: any[] = []
        if (getInput("version") && getInput("version") != "?") {
            fields.push({
                "name": "Version",
                "value": getInput("version"),
                "inline": true
            });
        }

        const ref = context.payload.ref!!.toString();

        fields.push({
            "name": ref.startsWith("refs/tags/") ? "Build Tag" : "Build Branch",
            "value": ref.replace("refs/heads/", "").replace("refs/tags/", ""),
            "inline": true
        })
        const includeCommitInfo = getInput('include_commit_message') == '' || getInput('include_commit_message') == 'true'
        if (includeCommitInfo) {
            fields.push({
                "name": "Commit message",
                "value": trim(replaceReferences(lastCommit.data.commit.message, `${context.repo.owner}/${context.repo.repo}`), 1024)
            })
        }

        if (getInput('fields')) {
            const inputFields: any[] = JSON.parse(getInput('fields'));
            inputFields.forEach(e => fields.push(e));
        }

        const embed = {
            "title": "Build " + userFriendlyName[status],
            "url": `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
            "color": colors[status],
            "fields": fields,
            "author": {
                "name": context.repo.repo,
                "url": `https://github.com/${context.repo.owner}/${context.repo.repo}`,
                "icon_url": `https://github.com/${context.repo.owner}.png`
            },
            "timestamp": new Date().toISOString()
        }

        if (includeCommitInfo) {
            embed['footer'] = {
                "text": lastCommit.data.author!!.login,
                "icon_url": lastCommit.data.author!!.avatar_url
            }
        }

        const json = {
            username: 'GitHub Actions',
            avatar_url: 'https://avatars.githubusercontent.com/in/15368?v=4',
            "embeds": [embed]
        }

        console.log(`Post body: ${JSON.stringify(json)}`)

        await axios.post(getInput("webhook_url"), json, {
            headers: {
                'Content-Type': 'application/json'
            }
        })
    } catch (error) {
        console.log(`Failed: ${error}`)
        // @ts-ignore
        setFailed(error.message);
    }
}

function trim(str: string, maxLength: number): string {
    return str.length > maxLength ? (str.substring(0, maxLength - 3) + "...") : str;
}

function replaceReferences(str: string, repo: string): string {
    str = str.replace(/\(#(?<number>\d+)\)/m, `[(#$1)](https://github.com/${repo}/pull/$1)`)
    str = str.replaceAll(/(?<type>(?:close|fix|resolve)(?:s|d|es|ed)?) #(?<number>\d+)/gmi, `$1 [#$2](https://github.com/${repo}/issues/$2)`)
    return str
}

function getStatus(status: string): Status {
    switch (status.toLowerCase()) {
        case "success": return Status.success
        case "failure": return Status.failed
        case "failed": return Status.failed

        case "cancelled": return Status.cancelled
        case "skipped": return Status.cancelled

        case "timed_out": return Status.timedout
        default: return Status.started
    }
}

run()
