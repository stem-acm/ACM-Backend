const jwt = require('jsonwebtoken');
const  { User }  = require('../models');
require('dotenv').config();
const SECRET = process.env.SECRET_KEY;

module.exports = Authentification = async (req, res, next) => {
    try {
        // const token = await req.headers['authorization'];
        const token = await req.headers.authorization?.split(' ')[1] || (req.query.auth) || undefined;
        
        const { id, email } = jwt.verify(await token, SECRET);
        const user = await User.findOne({ where: { id, email }});
        if (!user ) throw new Error();
        const { password, ...userWithoutPassword } = user.toJSON();
        req.user = userWithoutPassword;
        next();
    } catch (error) {
        res.status(401).send({success: false, message: error.message ??= 'Unautorised', data: null})
    }
}