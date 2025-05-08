const express = require("express");
const { client } = require("../../WA_index");
const router = express.Router();

router.post("/", async (req, res) => {
    const body = req.body;
    const jid = req.query.jid || "919072215994@s.whatsapp.net"; 
    const branch = req.query.branch

    if (!body || Object.keys(body).length === 0) { 
        return res.status(400).send("No body content received.");
    }

    res.status(200).send("Webhook received successfully.");

    try {
        const pusherName = body.pusher?.name || "Unknown User";
        const repoName = body.repository?.name || "Unknown Repository";
        const repoUrl = body.repository?.html_url;
        const compareUrl = body.compare; 

        let refName = "Unknown Ref";
        let refType = "Branch"; 
        if (body.ref) {
            if (body.ref.startsWith("refs/heads/")) {
                refName = body.ref.substring("refs/heads/".length);
                refType = "Branch";
            } else if (body.ref.startsWith("refs/tags/")) {
                refName = body.ref.substring("refs/tags/".length);
                refType = "Tag";
            } else {
                refName = body.ref; 
                refType = "Ref";
            }
        }
        if(branch && refType == "Branch" && refName != branch){
            return
        }
        let message = `🚀 *Push to ${repoName}* by *${pusherName}*\n`;
        if (repoUrl) {
            message += `📦 Repository: ${repoUrl}\n`;
        }
        message += `🌿 ${refType}: \`${refName}\`\n\n`;

        const commits = body.commits || [];
        const commitCount = commits.length;

        if (commitCount > 0) {
            message += `📝 *Commits (${commitCount}):*\n`;
            const MAX_COMMITS_TO_SHOW = 5; 

            for (let i = 0; i < Math.min(commitCount, MAX_COMMITS_TO_SHOW); i++) {
                const commit = commits[i];
                const commitMessage = (commit.message || "No commit message").split('\n')[0]; 
                const author = commit.author?.name || "Unknown Author";
                const shortSha = commit.id ? `\`${commit.id.substring(0, 7)}\`` : ""; 

                message += `  ${i + 1}. *${commitMessage}*\n`;
                message += `     _by ${author}_ ${shortSha}\n`;
            }

            if (commitCount > MAX_COMMITS_TO_SHOW) {
                message += `  ... and ${commitCount - MAX_COMMITS_TO_SHOW} more commit(s).\n`;
            }
        } else if (body.created && !body.deleted && commitCount === 0) {
            message += `✨ New ${refType.toLowerCase()} \`${refName}\` created.\n`;
        } else if (body.forced) {
            message += `⚠️ *Forced push detected* to \`${refName}\`. History may have been rewritten.\n`;
        }
        else {
            message += "ℹ️ No new commits in this push.\n";
        }

        if (compareUrl) {
            message += `\n🔗 *View changes:* ${compareUrl}\n`;
        }

        if (body.head_commit?.timestamp) {
            const pushTime = new Date(body.head_commit.timestamp).toLocaleString();
            message += `\n🕒 _Pushed at: ${pushTime}_`;
        }

        await client.sendMessage(jid, { text: message });
        console.log(`Message sent to ${jid}`);

    } catch (error) {
        console.error("Error processing webhook or sending WhatsApp message:", error);
    }
});

module.exports = router;
