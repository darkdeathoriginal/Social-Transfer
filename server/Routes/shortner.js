const express = require("express")
const { getLinkPreview, } = require("link-preview-js");
const webEmitter = require("../emmiter")
const { getShort } = require("../../WA_plugins/utils/urlshortner")
const router = express.Router()


router.get("/:id",async(req,res)=>{
    const id = req.params.id
    if(id){
        const url = await getShort(id)
        if(url){
            try {
                const metadata = await getLinkPreview(url)
            const linkPreviewHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta property="og:title" content="${metadata.title}">
                    <meta property="og:description" content="${metadata.description}">
                    <meta property="og:image" content="${metadata.images[0]}">
                </head>
                <body>
                    <script>
                        setTimeout(function() {
                            window.location.href = "${url}";
                        }, 10);
                    </script>
                </body>
                </html>
            `;


            return res.send(linkPreviewHTML);
            } catch (error) {
                console.log("error in redirect")
                console.error(error)
                return res.send("Url not found")
            }
            

        }
        return res.send("Url not found")
    }
    return res.send("invalid url")
})

module.exports = router