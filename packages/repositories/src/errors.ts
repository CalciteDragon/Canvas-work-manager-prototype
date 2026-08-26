export class RepositoryConflictError extends Error {
  constructor(collection: string, id: string) {
    super(`${collection} already contains id "${id}"`);
    this.name = 'RepositoryConflictError';
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(collection: string, id: string) {
    super(`${collection} does not contain id "${id}"`);
    this.name = 'RepositoryNotFoundError';
  }
}

export class DocumentIntegrityError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DocumentIntegrityError';
  }
}

export class UnitOfWorkInProgressError extends Error {
  constructor() {
    super('this data store already has a unit of work in progress');
    this.name = 'UnitOfWorkInProgressError';
  }
}
