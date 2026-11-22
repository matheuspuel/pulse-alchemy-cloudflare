# Pulse

Pulse is an uptime monitor. You add URLs, it checks them every minute, stores the results, and pushes status changes to an open dashboard in real time.

This project is an experiment to evaluate the development experience of [Alchemy](https://alchemy.run).

## First impressions

Alchemy makes it very simple and fast to deploy and update cloud infrastructure. It significantly shortens the development loop.

The abstraction makes it easy to design and understand the architecture and helps to deploy only what is necessary.

The documentation is comprehensive and explains what are the cloud resources it supports and when to use them.

## Failure experiments

### Duplicate delivery

A consumer may throw after writing the result but before it acknowledges, potentially duplicating the results.
The solution is to make the consumer idempotent.
Depending on the implementation, the handler may stop when a duplicate key is identified, or it may run again but the results are discarded.

### Poison message

If some message has a problem that makes the consumer always fail, this message will be dropped after the retry limits.
So a good practice is to move these problematic messages to a separate queue, called a dead-letter queue.
It frees the main queue and prevents losing messages.
The messages in a dead-letter queue can then be analyzed to identify and fix the problem, and can later be reprocessed.

### Slow target

Having messages that take long to be processed may cause the next messages in the batch wait and the accumulation of messages in a queue.
When messages are stacking up, Cloudflare scales consumers, draining the queue.
We can adjust some parameters like timeouts, batch size, retry limit and concurrency.
