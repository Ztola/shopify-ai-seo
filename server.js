dotenv.config();

const seoRoutes = require("./routes/seo");

const app = express();

@@ -13,6 +14,7 @@ app.use(express.json());

// ⚠️ IMPORTANT : Monte toutes les routes de SEO sous /api
app.use("/api", seoRoutes);

// Route de test
app.get("/", (req, res) => {
