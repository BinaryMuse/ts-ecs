import * as uuid from "uuid/v4"
import { Maybe } from "monet"


interface Constructor<T> {
  new(...args: any[]): T
}


// Entities are identified via a globally unique ID.
export type EntityId = string


// All components must implement `Component`.
export interface Component {}


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

  // Remove an entity from the world. All handles to the
  // entity are invalid once this is called.
  // Returns `true` if the entity was found and deleted, or `false` otherwise.
  // This entity handle is no longer valid after calling this method.
  public deleteEntity(entityId: EntityId): boolean {
    return this.em.deleteEntity(entityId)
  }

  // Get a list of `EntityId`s for all entities that have all the given
  // component types registered on them. `ctors` should be an array of
  // constructor functions for classes that implement `Component`.
  public withComponents(...ctors: Array<Constructor<Component>>): ReadonlyArray<EntityId> {
    return this.em.getEntitiesWithComponents(...ctors)
  }

  private em: EntityManager = new EntityManager()
}


// `EntityManager` is responsible for managing the creation and
// deletion of entities, as well as the registration of components
// to those entities. It is not designed for end-user consumption;
// instead, `World` exposes a subset of public APIs that delegate
// to an internal `EntityManager`.
class EntityManager {
  public createEntity(): Entity {
    const id = uuid()
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
    const registeredComponents = [...this.getComponentsForEntity(entityId).keys()]
    registeredComponents.forEach(ctor => this.removeComponent(entityId, ctor))
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
      return Maybe.Some(comp)
    } else {
      return Maybe.None()
    }
  }

  public getEntitiesWithComponents(...ctors: Array<Constructor<Component>>): ReadonlyArray<EntityId> {
    if (ctors.length === 0) {
      throw new Error("No Component constructor passed to World#withComponent")
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

  public removeComponents(entityId: EntityId, ctors: Array<Constructor<Component>>) {
    ctors.forEach(ctor => this.removeComponent(entityId, ctor))
  }

  public removeComponent<T extends Component>(entityId: EntityId, ctor: Constructor<T>): void {
    this.getComponentsForEntity(entityId).delete(ctor)
    this.getEntitiesForComponent(ctor).delete(entityId)
  }

  private getComponentsForEntity(entityId: EntityId): Map<Constructor<Component>, Component> {
    let entityComponents: Map<Constructor<Component>, Component>
    if (!this.entityComponents.has(entityId)) {
      entityComponents = new Map()
    } else {
      entityComponents = this.entityComponents.get(entityId)!
    }

    return entityComponents
  }

  private getEntitiesForComponent<T extends Component>(ctor: Constructor<T>): Set<EntityId> {
    let componentEntities = this.componentEntities.get(ctor)
    if (!this.componentEntities.has(ctor)) {
      componentEntities = new Set()
    } else {
      componentEntities = this.componentEntities.get(ctor)!
    }
    return componentEntities
  }

  private entities: Set<EntityId> = new Set()
  private entityComponents: Map<EntityId, Map<Constructor<Component>, Component>> = new Map()
  private componentEntities: Map<Constructor<Component>, Set<EntityId>> = new Map()
}
