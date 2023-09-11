import { Plugin, } from 'obsidian'
import HeatmapCalendarSettingsTab from "settings"

interface CalendarData {
    year: number,
    month?: number,
    startDate?: string,
    endDate?: string,
    expandedView: boolean,
    colors: {
        [index: string | number]: string[]
    } | string
    entries: Entry[]
    showCurrentDayBorder: boolean
    defaultEntryIntensity: number
    intensityScaleStart: number
    intensityScaleEnd: number
}

interface CalendarSettings extends CalendarData {
    colors: {
        [index: string | number]: string[]
    }
}

interface Entry {
    date: string
    intensity?: number
    color: string
    content: string
}
const DEFAULT_SETTINGS: CalendarData = {
    year: new Date().getFullYear(),
    colors: {
        default: ["#c6e48b", "#7bc96f", "#49af5d", "#2e8840", "#196127",],
    },
    entries: [{ date: "1900-01-01", color: "#7bc96f", intensity: 5, content: "", },],
    showCurrentDayBorder: true,
    defaultEntryIntensity: 4,
    intensityScaleStart: 1,
    intensityScaleEnd: 5,
    expandedView: false,
}
export default class HeatmapCalendar extends Plugin {

    settings: CalendarSettings

    /**
     * Returns a number representing how many days into the year the supplied date is. 
     * Example: first of january is 1, third of february is 34 (31+3) 
     * @param date
     */

    getDaysInBetween(startDate: Date, endDate: Date): number {
        return (
            Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()) -
            Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
        ) / 24 / 60 / 60 / 1000
    }

    getDaysInBetweenLocal(startDate: Date, endDate: Date): number {
        return (
            Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
            Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        ) / 24 / 60 / 60 / 1000
    }
    getHowManyDaysIntoYear(date: Date): number {
        return this.getDaysInBetween(new Date(Date.UTC(date.getFullYear(), 0, 0)), date)
    }
    getHowManyDaysIntoYearLocal(date: Date): number {

        return this.getDaysInBetweenLocal(new Date(Date.UTC(date.getFullYear(), 0, 0)), date)
    }
    /** 
     * Removes HTMLElements passed as entry.content and outside of the displayed year from rendering above the calendar
     */
    removeHtmlElementsNotInYear(entries: Entry[], year: number) {
        const calEntriesNotInDisplayedYear = entries.filter(e => new Date(e.date).getFullYear() !== year) ?? this.settings.entries
        //@ts-ignore
        calEntriesNotInDisplayedYear.forEach(e => e.content instanceof HTMLElement && e.content.remove())
    }

    clamp(input: number, min: number, max: number): number {
        return input < min ? min : input > max ? max : input
    }

    map(current: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
        const mapped: number = ((current - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
        return this.clamp(mapped, outMin, outMax)
    }

    async onload() {

        await this.loadSettings()

        this.addSettingTab(new HeatmapCalendarSettingsTab(this.app, this))

        //@ts-ignore
        window.renderHeatmapCalendar = (el: HTMLElement, calendarData: CalendarData): void => {

            const year = calendarData.year ?? this.settings.year
            const month = (calendarData.month ?? 0) - 1
            const colors = typeof calendarData.colors === "string"
                ? this.settings.colors[calendarData.colors]
                    ? { [calendarData.colors]: this.settings.colors[calendarData.colors], }
                    : this.settings.colors
                : calendarData.colors ?? this.settings.colors
            const expandedView = calendarData.expandedView ?? this.settings.expandedView

            // this.removeHtmlElementsNotInYear(calendarData.entries, year)

            //NOTE: check if calendarData date needs to be converted to UTC
            const startDate = ((year: number, month: number) => {
                if (month > -1) return new Date(Date.UTC(year, month, 1))
                else if (calendarData.startDate) {
                    let d = new Date(calendarData.startDate)
                    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
                }
                else return new Date(Date.UTC(year, 0, 1))
            })(year, month)

            const endDate = ((year: number, month: number) => {
                if (month > -1) return new Date(Date.UTC(year, month + 1, 0))
                else if (calendarData.endDate) {
                    let d = new Date(calendarData.endDate)
                    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
                }
                else return new Date(Date.UTC(year, 11, 31))
            })(year, month)

            const calEntries = calendarData.entries.filter(e => {
                let d = new Date(e.date)
                return d >= startDate && d <= endDate
            })

            const showCurrentDayBorder = calendarData.showCurrentDayBorder ?? this.settings.showCurrentDayBorder

            const defaultEntryIntensity = calendarData.defaultEntryIntensity ?? this.settings.defaultEntryIntensity

            const intensities = calEntries.filter(e => e.intensity).map(e => e.intensity as number)
            const minimumIntensity = intensities.length ? Math.min(...intensities) : this.settings.intensityScaleStart
            const maximumIntensity = intensities.length ? Math.max(...intensities) : this.settings.intensityScaleEnd
            const intensityScaleStart = calendarData.intensityScaleStart ?? minimumIntensity
            const intensityScaleEnd = calendarData.intensityScaleEnd ?? maximumIntensity

            const mappedEntries: Entry[] = []
            calEntries.forEach(e => {
                const newEntry = {
                    intensity: defaultEntryIntensity,
                    ...e,
                }
                const colorIntensities = typeof colors === "string"
                    ? this.settings.colors[colors]
                    : colors[e.color] ?? colors[Object.keys(colors)[0]]

                const numOfColorIntensities = Object.keys(colorIntensities).length

                if (minimumIntensity === maximumIntensity && intensityScaleStart === intensityScaleEnd) newEntry.intensity = numOfColorIntensities
                else newEntry.intensity = Math.round(this.map(newEntry.intensity, intensityScaleStart, intensityScaleEnd, 1, numOfColorIntensities))

                // index starts from 0, so add 1
                mappedEntries[this.getDaysInBetween(startDate, new Date(e.date)) + 1] = newEntry
            })

            let numberOfEmptyDaysBeforeYearBegins = (startDate.getUTCDay() + 6) % 7

            interface Box {
                backgroundColor?: string;
                date?: string;
                content?: string;
                classNames?: string[];
            }

            const boxes: Array<Box> = []

            for (let i = 0; i < numberOfEmptyDaysBeforeYearBegins; i++) {
                boxes.push({ backgroundColor: "transparent", })
            }
            const numberOfDaysInYearEndDate = this.getDaysInBetween(startDate, endDate) + 1
            const todaysDayNumberLocal = this.getDaysInBetweenLocal(startDate, new Date()) + 1


            for (let day = 1; day <= numberOfDaysInYearEndDate; day++) {
                const box: Box = {
                    classNames: [],
                }

                if (day === todaysDayNumberLocal && showCurrentDayBorder) box.classNames?.push("today")

                if (mappedEntries[day]) {
                    box.classNames?.push("hasData")
                    const entry = mappedEntries[day]

                    box.date = entry.date

                    if (entry.content) box.content = entry.content

                    const currentDayColors = entry.color ? colors[entry.color] : colors[Object.keys(colors)[0]]
                    box.backgroundColor = currentDayColors[entry.intensity as number - 1]

                } else box.classNames?.push("isEmpty")
                boxes.push(box)
            }

            const heatmapCalendarGraphDiv = createDiv({
                cls: "heatmap-calendar-graph",
                parent: el,
            })

            createDiv({
                cls: "heatmap-calendar-year",
                text: String(year).slice(2),
                parent: heatmapCalendarGraphDiv,
            })

            const heatmapCalendarMonthsUl = createEl("ul", {
                cls: "heatmap-calendar-months",
                parent: heatmapCalendarGraphDiv,
            })


            // start date and end date differes year + differences in month
            const noOfMonths = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth() + 1)

            // Get number of days left for starting month and days into ending month
            const weeksLeftForStartMonth = Math.floor((30 - startDate.getDate()) / 7) + (numberOfEmptyDaysBeforeYearBegins == 6 ? 1 : 0)
            const weeksCompletedForEndMonth = Math.floor(endDate.getDate() / 7) + 1


            const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

            let startMonth = startDate.getMonth()
            for (let month = 1; month <= noOfMonths; month++) {
                createEl("li", { text: MONTHS[startMonth % 12], parent: heatmapCalendarMonthsUl, })
                startMonth++;
            }

            const heatmapCalendarDaysUl = createEl("ul", {
                cls: "heatmap-calendar-days",
                parent: heatmapCalendarGraphDiv,
            })

            const WEEKS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            WEEKS.map(e => createEl("li", { text: e, parent: heatmapCalendarDaysUl, }))

            const heatmapCalendarBoxesUl = createEl("ul", {
                cls: "heatmap-calendar-boxes",
                parent: heatmapCalendarGraphDiv,
            })

            let noOfWeeks = Math.floor(numberOfDaysInYearEndDate / 7) + 1
            if (expandedView) {
                heatmapCalendarBoxesUl.style.setProperty("grid-template-columns", `repeat(${noOfWeeks}, minmax(0, 1fr))`)
                let repeatValuesForMonths = noOfMonths - 2 < 0 ? "" : `repeat(${noOfMonths - 2}, minmax(0, ${(noOfWeeks - weeksLeftForStartMonth - weeksCompletedForEndMonth) / (noOfMonths - 2)}fr))`
                heatmapCalendarMonthsUl.style.setProperty("grid-template-columns", `${weeksLeftForStartMonth}fr ${repeatValuesForMonths} ${weeksCompletedForEndMonth}fr`)
            } else {

                // 4 is based on the 4fr values. 53 is based on estimated 53 weeks of a year
                let repeatValuesForMonths = noOfMonths - 2 < 0 ? "" : `repeat(${noOfMonths - 2}, minmax(0, 4fr))`
                let padding = 53 - ((noOfMonths - 2 < 0 ? 0 : (noOfMonths - 2) * 4) + weeksLeftForStartMonth + weeksCompletedForEndMonth)
                let yearPadding = noOfMonths < 12 ? `minmax(0, ${padding}fr)` : ""
                heatmapCalendarBoxesUl.style.setProperty("grid-template-columns", `repeat(${noOfWeeks > 53 ? noOfWeeks : 53}, minmax(0, 1fr))`)
                heatmapCalendarMonthsUl.style.setProperty("grid-template-columns", `${weeksLeftForStartMonth}fr ${repeatValuesForMonths} ${weeksCompletedForEndMonth}fr ${yearPadding}`)
            }

            boxes.forEach(e => {
                const entry = createEl("li", {
                    attr: {
                        ...e.backgroundColor && { style: `background-color: ${e.backgroundColor};`, },
                        ...e.date && { "data-date": e.date, },
                    },
                    cls: e.classNames,
                    parent: heatmapCalendarBoxesUl,
                })

                createSpan({
                    cls: "heatmap-calendar-content",
                    parent: entry,
                    text: e.content,
                })
            })

        }
    }

    onunload() {

    }

    async loadSettings() {
        console.log("heyoh", await this.loadData())
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }
}
