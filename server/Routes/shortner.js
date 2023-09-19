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
                    <!-- Display the link preview content -->
                    <p>Link Preview:</p>
                    <p>Title: ${metadata.title}</p>
                    <p>Description: ${metadata.description}</p>
                    <img src="${metadata.images[0]}" alt="Link Preview Image">
                    
                    <!-- Redirect to the original URL after a delay -->
                    <script>
                        setTimeout(function() {
                            window.location.href = "${url}";
                        }, 3000); // Redirect after 3 seconds
                    </script>
                </body>
                </html>
            `;


            return res.send(linkPreviewHTML);

        }
        return res.send("Url not found")
    }
    return res.send("invalid url")
})

module.exports = router