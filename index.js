const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { fileURLToPath } = require('url');
require('dotenv').config();
const { sequelize } = require('./models');
const memberRoute = require('./routes/Member');
const authRoute = require('./routes/Auth');

const port = process.env.PORT;
const app = express();

sequelize.authenticate()
.then(() => console.log('Connexion à la base de données réussie'))
.catch(err => console.error('Erreur de connexion à la base de données :', err));

app.use(cors({ origin: '*' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/member', memberRoute);
app.use('/api/auth', authRoute);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.send({success: true, message: 'server is up ...', data: []});
})

app.use((req, res) => {
    res.status(404).json({ success: false, message: 'route not found ...', data: [] });
});

// adapter a la vercel
// app.listen(port, console.log(`server run in ${port}`));
module.exports = app;