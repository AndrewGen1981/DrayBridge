const express = require("express")
const loginRouter = express.Router()


const loginController = require("../Controllers/loginController")


function redirectToHome (req, res, next) {
    // if user is logged in, then redirect user to Home page
    if (req.session?._id) {
        return req.session?.role === "ADMIN"
            ? res.redirect('/admin/profile')
            : res.redirect('/user/profile')
    }
    next()
}


// @GET user/
// renders login form
loginRouter.get("/", redirectToHome, loginController.index)

// @POST user/
// logs user in
loginRouter.post("/", redirectToHome, loginController.logUserIn)


module.exports = loginRouter