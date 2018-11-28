import uuid from "./uuid"
import { Maybe } from "monet"


function now() {
  return new Date().getTime()
}


interface Constructor<T> {
  new(...args: any[]): T
}


// Entities are identified via a globally unique ID.
export type EntityId = string


// All components must implement `Component`.
export interface Component {}


// A `TickScheduler` is used by a `World` to schedule each call
// to the world's internal `tick` method. `scheduleTick` should
// schedule the passed function to be called in the future, and
// if it returns a non-null value, that value should be a handle
// that can be passed to `cancelTick` to cancel the scheduled tick.
export interface TickScheduler {
  scheduleTick: (tick: () => void) => any
  cancelTick: (handle: any) => any
}


class DefaultScheduler implements TickScheduler {
  scheduleTick(tick: () => void): number {
    return requestAnimationFrame(tick)
  }

  cancelTick(handle: number): void {
    return cancelAnimationFrame(handle)
  }
}


// An entity is just a global identifier; an `Entity` object
// is a handle that wraps such an identifier and delegates
// convenience methods to an underlying `EntityManager`.
//
// `Entity` objects should never be constructed on their own;
// they should only be created by `World#createEntity`.
export class Entity {
  constructor(em: EntityManager, entityId: EntityId) {
    this.em = em
    this.entityId = entityId
  }

  // Get the underlying `EntityId`.
  public getId(): EntityId {
    return this.entityId
  }

  // Add a `Component` to this entity. The component should be
  // a fully constructed commponent; that is to say, an instance
  // of a class that implements `Component`. Only once instance
  // of each component type can exist on an entity at a given time.
  public addComponent<T extends Component>(component: T): this {
    const ctor = component.constructor as Constructor<T>
    this.em.addComponent(this.entityId, ctor, component)
    return this
  }

  // Remove all components of the given types from this entity.
  // Each item in `ctors` should be a constructor function for a class
  // that implements `Component`. If any given component types don't exist
  // on the entity, they will be ignored.
  public removeComponents(...ctors: Array<Constructor<Component>>): this {
    this.em.removeComponents(this.entityId, ctors)
    return this
  }

  // Get the component instance for the component type `ctor` on this entity.
  // `ctor` should be the constructor function for a class that implements
  // `Component`. Returns `Maybe.Some(T)` if the component was found on the entity,
  // and `Maybe.None()` otherwise.
  public getComponent<T extends Component>(ctor: Constructor<T>): Maybe<T> {
    return this.em.getComponent<T>(this.entityId, ctor)
  }

  // Unsafe version of `getComponent` (throws if the component is not found).
  public getComponentUnsafe<T extends Component>(ctor: Constructor<T>): T {
    return this.getComponent(ctor).some()
  }

  // Determine if this entity has a component for all of the given
  // types. `ctors` should be an array of constructor functions
  // for classes that implement `Component`.
  public hasComponents(...ctors: Array<Constructor<Component>>): boolean {
    const components = ctors.map(ctor => this.getComponent(ctor))
    return components.every(comp => comp.isSome())
  }

  // Determine whether or not this `Entity` handle is still valid.
  // An entity handle is valid if the backing entity hasn't been deleted.
  public isValid(): boolean {
    return this.em.getEntity(this.entityId).isSome()
  }

  // Delete this entity. Convenience method for `World#deleteEntity()`.
  // Returns `true` if the entity was found and deleted, or `false` otherwise.
  // This entity handle is no longer valid after calling this method.
  public destroy(): boolean {
    return this.em.deleteEntity(this.entityId)
  }

  private em: EntityManager
  private entityId: EntityId
}


// A `World` is the root of the ECS architecture. It manages
// an internal `EntityManager`, which it uses to manage entities.
export class World {
  constructor() {
    this.tick = this.tick.bind(this)
  }

  // Create a new entity and get a handle to it.
  public createEntity(): Entity {
    return this.em.createEntity()
  }

  // Get an `Entity` handle object given an `EntityId`.
  // Returns `Maybe.Some(Entity)` if the entity was found,
  // or `Maybe.None()` otherwise.
  public getEntity(entityId: EntityId): Maybe<Entity> {
    return this.em.getEntity(entityId)
  }

  // Unsafe version of `getEntity` (throws if the entity is not found).
  public getEntityUnsafe(entityId: EntityId): Entity {
    return this.getEntity(entityId).some()
  }

  // Remove an entity from the world. All handles to the
  // entity are invalid once this is called. Returns `true`
  // if the entity was found and deleted, or `false` otherwise.
  public deleteEntity(entityId: EntityId): boolean {
    return this.em.deleteEntity(entityId)
  }

  // Get a list of `EntityId`s for all entities that have all the given
  // component types registered on them. `ctors` should be an array of
  // constructor functions for classes that implement `Component`.
  public withComponents(...ctors: Array<Constructor<Component>>): ReadonlyArray<EntityId> {
    return this.em.getEntitiesWithComponents(...ctors)
  }

  // Add a system to the world. The system's `configure` method
  // will be called with the `World` as the only argument.
  // The system's `tick` function will be called on every world
  // tick once the world is started.
  public addSystem(system: System): void {
    system.configure(this)
    this.systems.add(system)
  }

  // Remove a system from the world. The system's `unconfigure` method
  // will be called with the `World` as the only argument.
  public removeSystem(system: System): void {
    this.systems.delete(system)
    system.unconfigure(this)
  }

  // Start the world, which calls the `tick` method of every
  // system each time it ticks. `tickScheduler` should be an
  // instance of `TickScheduler` to use to schedule (and cancel)
  // calls to the world's internal `tick` method. If none is provided,
  // the world uses a default scheduler that uses `requestAnimationFrame`
  // and `cancelAnimationFrame` for scheduling ticks.
  public start(tickScheduler: TickScheduler = new DefaultScheduler()) {
    if (this.running) {
      return
    }

    this.running = true
    this.lastTick = now()
    this.scheduler = tickScheduler
    this.nextTickHandle = this.scheduler.scheduleTick(this.tick)
  }

  // Stops the world, preventing the world's systems from having
  // their `tick` methods called.
  public stop() {
    if (this.running) {
      this.running = false

      if (this.nextTickHandle) {
        this.scheduler!.cancelTick(this.nextTickHandle)
        this.nextTickHandle = null
      }
    }
  }

  private tick() {
    if (this.running) {
      const thisTick = now()
      const delta = thisTick - this.lastTick
      this.lastTick = thisTick

      for (const system of this.systems.values()) {
        system.tick(this, delta)
      }

      this.nextTickHandle = this.scheduler!.scheduleTick(this.tick)
    }
  }

  private em: EntityManager = new EntityManager()
  private systems: Set<System> = new Set()
  private running: boolean = false
  private scheduler: TickScheduler | null = null
  private lastTick: number = 0
  private nextTickHandle: any = null
}


// `EntityManager` is responsible for managing the creation and
// deletion of entities, as well as the registration of components
// to those entities. It is not designed for end-user consumption;
// instead, `World` exposes a subset of public APIs that delegate
// to an internal `EntityManager`.
class EntityManager {
  public createEntity(): Entity {
    const id = uuid.generate()
    this.entities.add(id)
    return new Entity(this, id)
  }

  public getEntity(id: EntityId): Maybe<Entity> {
    if (this.entities.has(id)) {
      const entity = new Entity(this, id)
      return Maybe.Some(entity)
    } else {
      return Maybe.None()
    }
  }

  public deleteEntity(entityId: EntityId): boolean {
    if (!this.entities.has(entityId)) {
      return false
    }

    // Remove all component registrations for this entity
    // so that `entityComponents` is empty for the given entity
    // and no `componentEntities` keys reference this entity.
    this.removeComponents(entityId, this.getComponentsForEntity(entityId).keys())
    // Now we can remove the remaining references to this entity.
    this.entityComponents.delete(entityId)
    this.entities.delete(entityId)
    return true
  }

  public addComponent<T extends Component>(entityId: EntityId, ctor: Constructor<T>, data: T): void {
    this.getComponentsForEntity(entityId).set(ctor, data)
    this.getEntitiesForComponent(ctor).add(entityId)
  }

  public getComponent<T extends Component>(entityId: EntityId, ctor: Constructor<T>): Maybe<T> {
    const components = this.getComponentsForEntity(entityId)
    const comp = components.get(ctor)
    if (comp) {
      return Maybe.Some(<T>comp)
    } else {
      return Maybe.None()
    }
  }

  public getEntitiesWithComponents(...ctors: Array<Constructor<Component>>): ReadonlyArray<EntityId> {
    if (ctors.length === 0) {
      throw new Error("No Component constructors passed to World#withComponent")
    }

    let result = []
    const sets = ctors.map(ctor => this.getEntitiesForComponent(ctor))
    const firstSet = sets[0]
    for (const entityId of firstSet) {
      if (sets.every(set => set.has(entityId))) {
        result.push(entityId)
      }
    }

    return result
  }

  public removeComponents(entityId: EntityId, ctors: Array<Constructor<Component>> | IterableIterator<Constructor<Component>>) {
    for (const ctor of ctors) {
      this.removeComponent(entityId, ctor)
    }
  }

  public removeComponent<T extends Component>(entityId: EntityId, ctor: Constructor<T>): void {
    this.getComponentsForEntity(entityId).delete(ctor)
    this.getEntitiesForComponent(ctor).delete(entityId)
  }

  private getComponentsForEntity(entityId: EntityId): Map<Constructor<Component>, Component> {
    let entityComponents: Map<Constructor<Component>, Component>
    if (!this.entityComponents.has(entityId)) {
      entityComponents = new Map()
      this.entityComponents.set(entityId, entityComponents)
    } else {
      entityComponents = this.entityComponents.get(entityId)!
    }

    return entityComponents
  }

  private getEntitiesForComponent<T extends Component>(ctor: Constructor<T>): Set<EntityId> {
    let componentEntities = this.componentEntities.get(ctor)
    if (!this.componentEntities.has(ctor)) {
      componentEntities = new Set()
      this.componentEntities.set(ctor, componentEntities)
    } else {
      componentEntities = this.componentEntities.get(ctor)!
    }
    return componentEntities
  }

  private entities: Set<EntityId> = new Set()
  private entityComponents: Map<EntityId, Map<Constructor<Component>, Component>> = new Map()
  private componentEntities: Map<Constructor<Component>, Set<EntityId>> = new Map()
}


export abstract class System {
  public abstract configure(world: World): void
  public abstract unconfigure(world: World): void
  public abstract tick(world: World, delta: number): void
}
