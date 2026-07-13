import { describe, it, expect, vi } from 'vitest'
import { createLogger } from '../../src/Logger.js'

describe('Logger', () => {
  it('should log info messages with INFO prefix', () => {
    const logger = createLogger(false)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('hello')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO] hello'))
    spy.mockRestore()
  })

  it('should suppress debug messages when not verbose', () => {
    const logger = createLogger(false)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.debug('debug msg')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('should show debug messages when verbose', () => {
    const logger = createLogger(true)
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.debug('debug msg')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] debug msg'))
    spy.mockRestore()
  })
})