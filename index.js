import http from "http"
import express from "express"
import { Server } from "socket.io"
import { createClient } from "@supabase/supabase-js"
import cors from "cors"
import morgan from "morgan"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import "dotenv/config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_API_KEY
)

const app = express()
app.use(cors())

// You need to create the HTTP server from the Express app
const httpServer = http.createServer(app)

// And then attach the socket.io server to the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: ["https://quizclashs.vercel.app", "http://localhost:5173"], // Adjust this to your Remix app's URL
    methods: ["GET", "POST"],
    credentials: true,
  },
})

async function addPlayerToRoom(name, hero, room) {
  try {
    await supabase.from("wars").insert({ room_id: room, player: name, hero })
  } catch {
    console.log("Error add player to the room!")
  }
}

async function getPlayersInRoom(room) {
  try {
    // Return the list of players in the room
    const { data } = await supabase.from("wars").select().eq("room_id", room)
    return data
  } catch {
    console.log("Error get players in a room!")
    return null
  }
}

// Then you can use `io` to listen the `connection` event and get a socket
// from a client
io.on("connection", (socket) => {
  // from this point you are on the WS connection with a specific client
  socket.emit("confirmation", "connected!")

  socket.on("join", async ({ name, hero, room }) => {
    socket.join(room)

    await addPlayerToRoom(name, hero, room)
    // Get updated list of players
    const players = await getPlayersInRoom(room)
    // Broadcast updated list to all clients in the room
    io.to(room).emit("get-player", players)
  })

  socket.on("get-player", async (room) => {
    socket.join(room)
    const players = await getPlayersInRoom(room)

    // Broadcast updated list to all clients in the room
    io.to(room).emit("get-player", players)
  })

  socket.on("start", (room) => {
    socket.join(room)
    io.to(room).emit("start")
  })

  socket.on("leaderboard", (room) => {
    socket.join(room)
  })

  socket.on("finish", async ({ room, name }) => {
    try {
      await supabase
        .from("wars")
        .update({ finish: true })
        .eq("player", name)
        .select()

      const { data } = await supabase.from("wars").select()
      const players = data.sort((a, z) => z.score - a.score)
      io.to(room).emit("player-finish", players)
    } catch (error) {
      console.log("Error finish-up the quiz!")
    }
  })

  socket.on("set-score", async ({ room, name, score }) => {
    try {
      const { data } = await supabase
        .from("wars")
        .select("score")
        .eq("player", name)

      const { data: player } = await supabase
        .from("wars")
        .update({ score: data[0].score + score })
        .eq("player", name)
        .select()

      io.to(room).emit("score", player)
    } catch (error) {
      console.log("Error updating score!")
    }
  })

  socket.on("event", (data) => {
    console.log(socket.id, data)
    socket.emit("event", "pong")
  })
})

app.use(morgan("tiny"))

app.get("/", (_, res) => {
  res.send("<h1>Hello world</h1>")
})

app.use(
  "/images",
  express.static(join(__dirname, "public/images"), {
    maxAge: "1y",
    immutable: true,
  })
)

app.use(
  "/videos",
  express.static(join(__dirname, "public/videos"), {
    maxAge: "1y",
    immutable: true,
  })
)

const port = process.env.PORT

// instead of running listen on the Express app, do it on the HTTP server
httpServer.listen(port, () => {
  console.log(`Express server listening at http://localhost:${port}`)
})
