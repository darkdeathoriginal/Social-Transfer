const express = require("express")
const { getShort, getMeta } = require("../../WA_plugins/utils/urlshortner")
const router = express.Router()


router.get("/:id",async(req,res)=>{
    const id = req.params.id
    if(id){
        const url = await getShort(id)
        if(url){
            try {
                const metadata = await getMeta(url)
            const linkPreviewHTML = `
                <!DOCTYPE html>
                <html>
                <head>
                    ${metadata}
                </head>
                <body>
                    <script>
                        window.location.href = "${url}";
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