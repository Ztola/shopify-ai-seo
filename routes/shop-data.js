const express = require("express");
const router = express.Router();

const {
    getAllCollections,
    getProductsByCollection
} = require("../services/shopify");

/* ===============================================================
   🔥 Route : GET /api/shop-data
   → Retourne toutes les collections + leurs produits
   → Utilise automatiquement la boutique envoyée via headers
================================================================ */
router.get("/shop-data", async (req, res) => {
    try {
        console.log("📦 [shop-data] Connecté à :", req.headers["x-shopify-url"]);

        // 1️⃣ Récupérer les collections depuis la boutique active
        const collections = await getAllCollections(req);

        if (!collections || collections.length === 0) {
            console.log("⚠️ Aucune collection trouvée");
            return res.json({
                success: true,
                data: { collections: [] }
            });
        }

        const finalCollections = [];

        // 2️⃣ Pour CHAQUE collection → récupérer les produits
        for (let col of collections) {
            let products = [];

            try {
                products = await getProductsByCollection(req, col.id);
            } catch (err) {
                console.warn("⚠️ Impossible de charger les produits pour :", col.title);
            }

            finalCollections.push({
                id: col.id,
                title: col.title,
                handle: col.handle,
                products: products.map(p => ({
                    id: p.id,
                    title: p.title,
                    handle: p.handle,
                    optimized: false
                }))
            });
        }

        // 3️⃣ Réponse OK
        return res.json({
            success: true,
            data: {
                collections: finalCollections
            }
        });

    } catch (err) {
        console.error("❌ ERREUR shop-data.js :", err);
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

module.exports = router;
