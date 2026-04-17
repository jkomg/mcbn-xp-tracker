type WikiSyncOwner = 'manual' | 'scheduled';

type WikiSyncLease = {
  owner: WikiSyncOwner;
  release: () => void;
};

let _owner: WikiSyncOwner | null = null;

export function currentWikiSyncOwner(): WikiSyncOwner | null {
  return _owner;
}

export function tryAcquireWikiSync(owner: WikiSyncOwner): WikiSyncLease | null {
  if (_owner) {
    return null;
  }
  _owner = owner;
  let released = false;
  return {
    owner,
    release: () => {
      if (released) return;
      released = true;
      if (_owner === owner) {
        _owner = null;
      }
    },
  };
}

