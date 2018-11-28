import { Component, System, World, Entity } from "../../../src"


// Components

// Indicates that other entities should try to move toward this one
class Leader implements Component {}

// Indicates (x, y) screen coordinates for an entity
class Position implements Component {
  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  x: number
  y: number
}

// Indicates how fast an entity can move
class Speed implements Component {
  constructor(speed: number) {
    this.speed = speed
  }

  speed: number
}

// Indicates how to visualize a circular shape representing an entity
class Circular implements Component {
  constructor(radius: number, color: string) {
    this.radius = radius
    this.color = color
  }

  radius: number
  color: string
}


// Systems

// Handles updating the `Leader` entity based on mouse movement,
// and adding additional follower entities when the user clicks
class MouseSystem extends System {
  constructor(world: World) {
    super()
    this.world = world
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleMouseClick = this.handleMouseClick.bind(this)
  }

  public configure() {
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('click', this.handleMouseClick)
  }

  public unconfigure() {
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('click', this.handleMouseClick)
  }

  private handleMouseMove(evt: MouseEvent) {
    const { clientX, clientY } = evt

    getLeader(this.world)
      .getComponent(Position)
      .forEach(position => {
        position.x = clientX
        position.y = clientY
      })
  }

  private handleMouseClick(evt: MouseEvent) {
    const { clientX, clientY } = evt
    createCircle(this.world, clientX, clientY)
  }

  // This system doesn't need to do anything per tick
  public tick() {}

  private world: World
}


// Handles drawing entities that should appear on the screen
class RenderSystem extends System {
  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    super()
    this.canvas = canvas
    this.ctx = ctx
  }

  public configure() {}
  public unconfigure() {}

  public tick(world: World, _delta: number) {
    this.ctx.fillStyle = "white"
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    const circles = world.withComponents(Position, Circular)
    for (const circle of circles) {
      // We can use the `unsafe` versions of `getEntity` and `getComponent`
      // here because `withCoponents` guarantees that the components
      // exist and have all the components we passed to it.
      const entity = world.getEntityUnsafe(circle)
      const { color, radius } = entity.getComponentUnsafe(Circular)
      const { x, y } = entity.getComponentUnsafe(Position)

      this.ctx.strokeStyle = color
      this.ctx.beginPath()
      this.ctx.arc(x, y, radius, 0, 2 * Math.PI)
      this.ctx.stroke()
    }
  }

  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
}


// Moves each entity with a `Position` and `Speed` toward the `Leader`
class MovementSystem extends System {
  public configure() {}
  public unconfigure() {}

  public tick(world: World, delta: number) {
    const leader = getLeader(world)
    const { x, y } = leader.getComponentUnsafe(Position)

    const toMove = world.withComponents(Position, Speed).map(id => world.getEntityUnsafe(id))
    for (const entity of toMove) {
      const { speed } = entity.getComponentUnsafe(Speed)
      const circlePos = entity.getComponentUnsafe(Position)

      const diffX = x - circlePos.x
      const diffY = y - circlePos.y
      const magnitude = Math.sqrt(diffX * diffX + diffY * diffY)
      if (magnitude === 0) {
        // Dividing by zero is never fun
        continue
      }
      const unitX = diffX / magnitude
      const unitY = diffY / magnitude

      circlePos.x += unitX * delta * speed
      circlePos.y += unitY * delta * speed
    }
  }
}


// Helpers

// Generate a random float between `min` and `max`
function rnd(min: number, max: number) {
  return Math.random() * (max - min) + min
}

// Create a new follower circle with the given coordinates
function createCircle(world: World, x: number, y: number) {
  world.createEntity()
    .addComponent(new Position(x, y))
    .addComponent(new Circular(Math.random() * 10 + 10, "black"))
    .addComponent(new Speed(rnd(0.01, 0.05)))
}

// Get the leader entity (there should be exactly one)
function getLeader(world: World): Entity {
  const leaders = world.withComponents(Leader, Position).map(id => world.getEntityUnsafe(id))
  if (leaders.length !== 1) {
    throw new Error("Expected exactly one leader")
  }
  return leaders[0]
}

function setup() {
  const canvas = <HTMLCanvasElement>document.getElementById('canvas')!
  const width = canvas.width
  const height = canvas.height
  const ctx = canvas.getContext('2d')!

  const world = new World

  // Create the leader entity, which all other moving entities follow
  world.createEntity()
    .addComponent(new Leader())
    .addComponent(new Position(0.1, 0.1))
    .addComponent(new Circular(5, "red"))

  // Create some number of random follower entities
  for (let i = 0; i < 10; i++) {
    const randomX = Math.random() * width
    const randomY = Math.random() * height
    createCircle(world, randomX, randomY)
  }

  // Add our relevant systems
  world.addSystem(new MouseSystem(world))
  world.addSystem(new MovementSystem())
  world.addSystem(new RenderSystem(canvas, ctx))

  // Let's go!
  world.start()
}

setup()
