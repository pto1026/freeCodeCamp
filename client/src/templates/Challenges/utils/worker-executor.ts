interface WorkerType {
  postMessage(data: string): void;

  onerror: null | string | ((e: EventType) => void);
  onmessage: null | string | ((e: EventType) => void);
  location: string,
  maxWorkers: number,
  terminateWorker: boolean,

  terminate(): void;
}

interface Task {
  _worker: WorkerType;

  _execute(w: () => Promise<unknown>): Promisem<unknown>;
}

interface Promisem<T> {
  done: Promise<T>;
}

interface EventType {
  message: string;
  data: { type: string; data: string; };
}

interface ErrorType {
  message: string;
  _events?: EventType[];
  on?: string;
  removeListener?: string;
  emit?: string;
  once?: string;
}

interface DataType {

}

class WorkerExecutor {
  private _scriptURL: string;
  private _terminateWorker: boolean;
  private _maxWorkers: number;
  private _workersInUse: number;
  private _taskQueue: Task[];
  private _workerPool: WorkerType[];
  _events: {} | undefined;
  private _execute: ((getWorker: () => Promise<WorkerType>) => void) | undefined;
  private _worker: WorkerType | undefined | null;

  constructor(
    workerName: string,
    {location = '/js/', maxWorkers = 2, terminateWorker = false}: WorkerType
  ) {
    this._workerPool = [];
    this._taskQueue = [];
    this._workersInUse = 0;
    this._maxWorkers = maxWorkers;
    this._terminateWorker = terminateWorker;
    this._scriptURL = `${location}${workerName}.js`;

    this._getWorker = this._getWorker.bind(this);
  }

  async _getWorker() {
    return this._workerPool.length
      ? this._workerPool.shift()
      : this._createWorker();
  }

  _createWorker() {
    return new Promise((resolve, reject) => {
      const newWorker = new Worker(this._scriptURL);
      newWorker.onmessage = e => {
        if (e.data?.type === 'contentLoaded') {
          resolve(newWorker);
        }
      };
      newWorker.onerror = err => reject(err);
    });
  }

  _handleTaskEnd(task: Task | undefined) {
    return () => {
      this._workersInUse--;
      const worker = task?._worker;
      if (worker) {
        if (this._terminateWorker) {
          worker.terminate();
        } else {
          worker.onmessage = null;
          worker.onerror = null;
          this._workerPool.push(worker);
        }
      }
      this._processQueue();
    };
  }

  _processQueue() {
    while (this._workersInUse < this._maxWorkers && this._taskQueue.length) {
      const task: Task | undefined = this._taskQueue.shift();
      const handleTaskEnd = this._handleTaskEnd(task);
      task?._execute(this._getWorker).done.then(handleTaskEnd, handleTaskEnd);
      this._workersInUse++;
    }
  }

  execute(data: string, timeout = 1000) {
    let task: { done: Promise<string> } | WorkerExecutor | { done(): void } | {
      _worker: null;
    } | {};
    task = eventify({});
    if (task instanceof WorkerExecutor) {
    task._execute = function (getWorker: () => Promise<WorkerType>) {
      getWorker().then(
        worker => {
          if (task instanceof WorkerExecutor) {
            task._worker = worker;
          }
          const timeoutId = setTimeout(() => {
            if (task instanceof WorkerExecutor) {
              task._worker?.terminate();
            }
            task._worker = null;
            this.emit('error', {message: 'timeout'});
          }, timeout);

          worker.onmessage = (e: EventType) => {
            clearTimeout(timeoutId);
            // data.type is undefined when the message has been processed
            // successfully and defined when something else has happened (e.g.
            // an error occurred)
            if (e.data?.type) {
              this.emit(e.data.type, e.data.data);
            } else {
              this.emit('done', e.data);
            }
          };

          worker.onerror = (e: EventType) => {
            clearTimeout(timeoutId);
            this.emit('error', {message: e.message});
          };

          worker.postMessage(data);
        },
        err => this.emit('error', err)
      );
    }
      return this;
    }

    task.done = new Promise((resolve, reject) => {
      task
        .once('done', (data: unknown | string) => resolve(data))
        .once('error', (err: ErrorType) => reject(err.message));
    });

    this._taskQueue.push(task);
    this._processQueue();
    return task;
  }

  emit(arg0: string, arg1: { message: string } | string | DataType): void | undefined {
        throw new Error("Method not implemented.");
    }
}

// Error and completion handling
const eventify = (self: {} | WorkerExecutor) => {
  if (self instanceof WorkerExecutor) {
    self._events = {};
  }

  self.on = (event: EventType, listener: string) => {
    if (typeof !(self instanceof WorkerExecutor) || !(self instanceof WorkerExecutor) || self._events?[event] === 'undefined') {
      self._events[event] = [];
    }
    self._events[event].push(listener);
    return self;
  };

  self.removeListener = (event, listener) => {
    if (typeof self._events[event] !== 'undefined') {
      const index = self._events[event].indexOf(listener);
      if (index !== -1) {
        self._events[event].splice(index, 1);
      }
    }
    return self;
  };

  self.emit = (event, ...args) => {
    if (typeof self._events[event] !== 'undefined') {
      self._events[event].forEach(listener => {
        listener.apply(self, args);
      });
    }
    return self;
  };

  self.once = (event, listener) => {
    self.on(event, function handler(...args) {
      self.removeListener(handler);
      listener.apply(self, args);
    });
    return self;
  };

  return self;
};

export default function createWorkerExecutor(workerName, options) {
  return new WorkerExecutor(workerName, options);
}
