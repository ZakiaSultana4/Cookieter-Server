const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 9000;
const app = express();

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://cookieter-a1d62.web.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// verify jwt middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.log(err);
        return res.status(401).send({ message: "unauthorized access" });
      }
      console.log(decoded);

      req.user = decoded;
      next();
    });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.e0fsll4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const foodsCollection = client.db("Cookieter").collection("foods");
    const foodRequestCollection = client
      .db("Cookieter")
      .collection("foodRequest");

    // jwt generate
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Clear token on logout
    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ success: true });
    });

    // In Navber when a user want to logout
    app.post("/logout", async (req, res) => {
      try {
        console.log("user logout ", req.body);

        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production" ? true : false,
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ logout: true });
      } catch (err) {
        console.log(err.message);
      }
    });
    // ________________________________________________________________
    //---------------All functionality for food operations----------------------
    // create post EP to receive food information in foodCollection db<----(AddFood-Comp)
    app.post("/add-food", async (req, res) => {
      const food = req.body;
      const result = await foodsCollection.insertOne(food);
      res.send(result);
    });
    app.get("/foods", async (req, res) => {
      try {
        let categoryText = req?.query?.category;
        let sortingProcess = "";
        let query = {};
        let options = {};
        let searchQuery = req?.query?.search;

        if (req.query) {
          if (categoryText) {
            if (req.query.category.search("And") > 0) {
              categoryText = req.query.category.replace(/And/gi, "&");
            }
            query = { category: categoryText };
          }
        }

        if (searchQuery) {
          query = { foodName: { $regex: searchQuery, $options: "i" } };
        }

        if (req.query.sort && req.query.sortItem === "expiredDate") {
          sortingProcess = req.query.sort;
          options = {
            sort: {
              expiredDate: sortingProcess === "asc" ? 1 : -1,
            },
          };
        }

        if (req.query.sort && req.query.sortItem === "foodQuantity") {
          sortingProcess = req.query.sort;

          options = {
            sort: {
              foodQuantity: sortingProcess === "asc" ? 1 : -1,
            },
          };
        }

        const cursor = foodsCollection.find(query, options);
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });

    app.get("/find-foods", async (req, res) => {
      const result = await foodsCollection.find().toArray();
      res.send(result);
    });
    app.get("/food/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await foodsCollection.findOne(query);
      res.send(result);
    });
    //----All functionality for Manage Food operations-------
    // get all foods for delet and update food which foods are added by current user---->(ManageFood comp)
    app.get("/manage-food", async (req, res) => {
      try {
        // if (req?.query.email !== req?.user?.user) {
        //   return res.status(403).send({ message: "Forbidden Access!" });
        // }

        const query = { donarEmail: req.query.email };
        const result = await foodsCollection.find(query).toArray();

        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });

    app.delete("/manage-food/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await foodsCollection.deleteOne(query);

        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });
    app.patch("/update-mfood/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateData = req.body;
        const updateDoc = {
          $set: {
            foodName: updateData.foodName,
            foodImage: updateData.foodImage,
            foodQuantity: updateData.foodQuantity,
            expiredDate: updateData.expiredDate,
            pickUpLocation: updateData.pickUpLocation,
            category: updateData.category,
            additionalNotes: updateData.additionalNotes,
          },
        };

        const result = await foodsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });

    // ________________________________________________________________
    app.post("/food-request", async (req, res) => {
      try {
        const requestData = req.body;
        const query = {
          foodId: requestData.foodId,
          requesterEmail: requestData.requesterEmail,
        };
        const isExist = await foodRequestCollection.findOne(query);

        if (isExist?.requesterEmail === requestData?.requesterEmail) {
          return res.status(409).send({ message: "Conflict" });
        }

        const result = await foodRequestCollection.insertOne(requestData);
        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });
    // done------>FoodRequest
    app.get("/find-food-request", async (req, res) => {
      try {
        const email = req.query.email;
        const query = { requesterEmail: email };

        const option = {
          projection: {
            foodName: 1,
            foodImage: 1,
            donarName: 1,
            pickUpLocation: 1,
            expiredDate: 1,
            requestDate: 1,
            donateMoney: 1,
            status: 1,
          },
        };

        const result = await foodRequestCollection
          .find(query, option)
          .toArray();
        res.send(result);
      } catch (error) {
        console.log(error.message);
      }
    });
    // done------>FoodRequest
    app.delete("/food-request/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await foodRequestCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });
    // ________________________________________________________________

    app.get("/manage-food-request", async (req, res) => {
      try {
        const donarInfo = req.query;
        const query = {
          donarEmail: donarInfo.email,
          foodId: donarInfo.id,
        };

        const option = {
          projection: {
            requesterName: 1,
            requesterEmail: 1,
            requesterImage: 1,
            requestDate: 1,
            status: 1,
            additionalNotes: 1,
            foodId: 1,
          },
        };

        const result = await foodRequestCollection
          .find(query, option)
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });

    app.patch("/manage-food-request", async (req, res) => {
      try {
        const requestId = req.query.id;
        const foodId = req.query.foodId;

        const removeFood = await foodsCollection.deleteOne({
          _id: new ObjectId(foodId),
        });

        const updateDoc = {
          $set: {
            status: "Delivered",
          },
        };
        const query = { _id: new ObjectId(requestId) };
        const result = await foodRequestCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        console.log(err.message);
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello from SoloSphere Server....");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
