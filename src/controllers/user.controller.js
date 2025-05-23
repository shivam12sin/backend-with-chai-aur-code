import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"


const generateAccessAndRefereshTokens = async(userId)=>{
  try {
    const user  = await  User.findById(userId)
   const accessToken =  user.genrateAccessToken()
   const refreshToken =  user.genrateRefreshToken()

   user.refreshToken = refreshToken
   await user.save({validateBeforeSave: false})
   return {accessToken,refreshToken}
    
  } catch (error) {
    throw new ApiError(500,"Something went wrong while generating tokens")
  }
}

const registerUser = asyncHandler(async(req , res)=>{

    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

   const {fullName ,email,username,password} =  req.body

   //console.log("email: " , email)

   if(
     [fullName,email,username,password].some((field)=> field?.trim() === "")
   ){
      throw new ApiError(400,"All fields are required")
   }

   

   const existedUser = await User.findOne({
    $or:[{username}, {email}]
   })

   if(existedUser){
    throw new ApiError(409,"User with email or username already exists")
   }
   //console.log("files recived",req.files);

   const avatarLocalPath = req.files?.avatar[0]?.path;

   //console.log(avatarLocalPath)

   //console.log("req.files:", req.files);
   //console.log("avatar path:", req.files?.//avatar?.[0]?.path)
   
   //const coverImageLocalPath = req.files?.coverImage[0]?.path;


   let coverImageLocalPath ;
   if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length>0){
    coverImageLocalPath = req.files.coverImage[0].path
   }

   if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is required")
   }


   const avatar = await uploadOnCloudinary(avatarLocalPath)
   

   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   if(!avatar){
    throw new ApiError(400,"Avatar file is required")
   }

   const user = await User.create({
    fullName,
    avatar:avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username:username.toLowerCase()
   })

   const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
   )


   if(!createdUser){
    throw new ApiError(500,"Somthing went wrong while registering user")
   }

   return res.status(201).json(
    new ApiResponse(200,createdUser,"User registered Succesfully")
   )

    
  //  if(fullName == ""){
  //   throw new ApiError(400,"fullname is required")
  //  }

})

const loginUser = asyncHandler(async (req,res)=>{
   //get user details from frontend from req body
   //check validation --not empty username or email
   //check if user exits in database
   //if exist check password
   //if password is macthed genrate acces and refresh token
   //send cookies(access,refresh)

   const {email,username,password} = req.body
   //console.log(email)

   if(!username && !email ){
    throw new ApiError(400,"username or email is required"); 
   }

   const user = await User.findOne({
    $or:[{username},{email}]
   })

   if(!user){
    throw new ApiError(404,"User does not exists")
   }

  const isPasswordValid =  await user.isPasswordCorrect(password)
  if(!isPasswordValid){
    throw new ApiError(401 ,"Invalid Password"); 
  }
 const {accessToken , refreshToken} = await  generateAccessAndRefereshTokens(user._id)

const loggedInUser =  await  User.findById(user._id).select("-password  -refreshToken")

const options = {
  httpOnly:true,
  secure:true
}

return res
.status(200)
.cookie("accessToken",accessToken,options)
.cookie("refreshToken",refreshToken,options)
.json(
  new ApiResponse(
    200,
  {
    user:loggedInUser,accessToken,
    refreshToken
  },"User Logged In Successfully")

)

})

const logoutUser = asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set:{
        refreshToken:undefined
      }
    },
    {
      new :true
    }
  )

  const options = {
    httpOnly:true,
    secure:true
  }
  return res
  .status(200)
  .clearCookie("accessToken",options)
  .clearCookie("refreshToken",options)
  .json(new ApiResponse(200,{},"User logout Successfully"))

  
})
const refreshAccessToken = asyncHandler(async(req,res)=>{
 const incomingRefreshToken =  req.cookies.refreshToken || req.body.refreshToken

 if(!incomingRefreshToken){
  throw new ApiError(401,"unauthorized request")
 }

 try {
  const decodedToken = jwt.verify(incomingRefreshToken,
   process.env.REFRESH_TOKEN_SECRET)
 
  const user = await User.findById(decodedToken?._id) 
 
  if(!user){
   throw new ApiError(401,"Invalid refreshToken")
  }
 
  if(incomingRefreshToken !== user?.refreshToken){
   throw new ApiError(401,"Refresh token is expired or used")
  }
 
  const options = {
   httpOnly:true,
   secure:true
  }
 
  const {accessToken,newrefreshToken} = await generateAccessAndRefereshTokens(user._id)
 
  return res
  .status(200)
  .cookie("accessToken",accessToken,options)
  .cookie("refreshToken",newrefreshToken,options)
  .json(
   new ApiResponse(
     200,
     {accessToken, refreshToken:newrefreshToken},
     "Access token refreshed"
   )
  )
 } catch (error) {
  throw new ApiError(401,error?.message ||
    "Invalid refresh token"
  )
  
 }

 

})

const changeCurrentPassword = asyncHandler(async(req,res)=>{
    const {oldPassword , newPassword} = req.body

   const user = await User.findById(req.user?._id)

   const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

   if(!isPasswordCorrect){
    throw new ApiError(400,"Invalid old password")
   }
   
   user.password = newPassword
   await user.save({validateBeforeSave:false})

   return res
   .status(200)
   .json(new ApiResponse(200,{},"Password changed Successfully"))

})

const getCurrentUser = asyncHandler(async(req,res)=>{
  return res.
  status(200)
  .json(200,req.user,"current user fetched successfully")
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
  const avatarLocalPath = req.file?.path

  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is missing")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(400,"Error while uploading avatar")
  }


  const user  = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar:avatar.url
      }

    },
    {new:true}
  ).select("-password")

  return res
  .status(200)
  .json(
    new ApiResponse(200,user,"avatar image is updated succesfully")
  )

})
const updateUserCoverImage = asyncHandler(async(req,res)=>{
  const coverLocalPath = req.file?.path

  if(!coverLocalPath){
    throw new ApiError(400,"coverimage file is missing")
  }

  const coverImage = await uploadOnCloudinary(coverLocalPath)

  if(!coverImage.url){
    throw new ApiError(400,"Error while uploading coverImage")
  }


  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        coverImage:coverImage.url
      }

    },
    {new:true}
  ).select("-password")

  return res
  .status(200)
  .json(
    new ApiResponse(200,user,"cover image is updated succesfully")
  )



})
const updateAccountDetails = asyncHandler(async(req,res)=>{
  const {fullName,email} = req.body

  if(!fullName || !email){
    throw new ApiError(400,"All fields are required")
  }

 User.findByIdAndUpdate(
  req.user?._id,
  {
    $set:{
      fullName,
      email
    }
  },
  {new:true}
).select("-password")

return res
.status(200)
.json(new ApiResponse(200,"Account details updated successfully"))
})
export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage
}




