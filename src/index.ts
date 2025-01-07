#! /usr/bin/env node

//
// Cloudy Pad index 
//
// - Prepare CLI program
// - Load CLI config, initialize it if needed
// - Initialize analytics client if enabled
//

import { ConfigManager } from "./core/config/manager"
import { getLogger } from "./log/utils"
import { buildProgram } from "./program"
import { AnalyticsInitializer } from "./tools/analytics/initializer"
import { AnalyticsManager } from "./tools/analytics/manager"

const logger = getLogger("main")

async function main(){
    try {
        ConfigManager.getInstance().init()
        await new AnalyticsInitializer().promptAnalyticsConsentUnlessAlreadyDone()

        const program = buildProgram()
        await program.parseAsync(process.argv)

        // Shutdown
        await AnalyticsManager.get().shutdown()
        
    } catch (e){
        logger.error("Oops, something went wrong 😨", e)
        logger.error("If you think this is a bug, please file an issue with error logs: https://github.com/PierreBeucher/cloudypad/issues")

        const eventProps = e instanceof Error ? { errorMessage: e.message, stackTrace: e.stack } : { errorMessage: String(e), stackTrace: "unknown" }
        AnalyticsManager.get().sendEvent("error", eventProps)
        process.exit(1)
    }
}

main().finally(() => {
    logger.debug("Main function finished. Exiting...")
})