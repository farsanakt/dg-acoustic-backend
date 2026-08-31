const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: [true, "Name required"], trim: true },
    email:    { type: String, required: [true, "Email required"], unique: true,
                lowercase: true, trim: true },
    password: { type: String, required: [true, "Password required"],
                minlength: 6, select: false },
    role:     { type: String, enum: ["admin","engineer","client"], default: "engineer" },
    isActive: { type: Boolean, default: true },
    lastLogin:{ type: Date },
  },
  { timestamps: true }
);

// Hash before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
