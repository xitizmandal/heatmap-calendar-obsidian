import { Plugin, } from 'obsidian'
import HeatmapCalendarSettingsTab from "settings"

interface CalendarData {
    year: number,
    month?: number,
    startDate: string,
    endDate: string,
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
    startDate: new Date(new Date().getFullYear(), 0, 1).toString(),
    endDate: new Date(new Date().getFullYear(), 11, 31).toString(),
    colors: {
        default: ["#c6e48b", "#7bc96f", "#49af5d", "#2e8840", "#196127",],
    },
    entries: [{ date: "1900-01-01", color: "#7bc96f", intensity: 5, content: "", },],
    showCurrentDayBorder: true,
    defaultEntryIntensity: 4,
    intensityScaleStart: 1,
    intensityScaleEnd: 5,
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
            const month = calendarData.month ?? -1
            const colors = typeof calendarData.colors === "string"
                ? this.settings.colors[calendarData.colors]
                    ? { [calendarData.colors]: this.settings.colors[calendarData.colors], }
                    : this.settings.colors
                : calendarData.colors ?? this.settings.colors

            this.removeHtmlElementsNotInYear(calendarData.entries, year)

            // TODO: Need to filter this based on range of dates
            const startDateString = calendarData.startDate ?? this.settings.startDate
            const endDateString = calendarData.endDate ?? this.settings.endDate

            // FIX: check for date ranges
            const startDate = month > -1 ? new Date(year, month, 1) : new Date(startDateString)
            const endDate = month > -1 ? new Date(year, month + 1, 0) : new Date(endDateString)
            console.log(startDate, endDate)

            const calEntries = calendarData.entries.filter(e => {
                let d = new Date(e.date + "T00:00")
                return d >= startDate && d <= endDate
            }
            )

            const showCurrentDayBorder = calendarData.showCurrentDayBorder ?? this.settings.showCurrentDayBorder

            const defaultEntryIntensity = calendarData.defaultEntryIntensity ?? this.settings.defaultEntryIntensity

            const intensities = calEntries.filter(e => e.intensity).map(e => e.intensity as number)
            const minimumIntensity = intensities.length ? Math.min(...intensities) : this.settings.intensityScaleStart
            const maximumIntensity = intensities.length ? Math.max(...intensities) : this.settings.intensityScaleEnd
            const intensityScaleStart = calendarData.intensityScaleStart ?? minimumIntensity
            const intensityScaleEnd = calendarData.intensityScaleEnd ?? maximumIntensity

            const mappedEntries: Entry[] = []
			// TODO: Check for the entries
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

                mappedEntries[this.getHowManyDaysIntoYear(new Date(e.date))] = newEntry
            })
			console.log(calEntries)

            const firstDayOfYear = new Date(Date.UTC(year, 0, 1))
            let numberOfEmptyDaysBeforeYearBegins = (firstDayOfYear.getUTCDay() + 6) % 7

            interface Box {
                backgroundColor?: string;
                date?: string;
                content?: string;
                classNames?: string[];
            }

            const boxes: Array<Box> = []

            while (numberOfEmptyDaysBeforeYearBegins) {
                boxes.push({ backgroundColor: "transparent", })
                numberOfEmptyDaysBeforeYearBegins--
            }
            const lastDayOfYear = new Date(Date.UTC(year, 11, 31))
			// TODO: Fix the number of days correspondances with
			// 1. Boxes
			// 2. Entries
			// 3. CSS/Views
            // const numberOfDaysInYear = this.getHowManyDaysIntoYear(lastDayOfYear) //eg 365 or 366
			const numberOfDaysInYear = this.getDaysInBetween(startDate, endDate)
            const todaysDayNumberLocal = this.getHowManyDaysIntoYearLocal(new Date())


            for (let day = 1; day <= numberOfDaysInYear; day++) {

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

            createEl("li", { text: "Jan", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Feb", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Mar", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Apr", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "May", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Jun", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Jul", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Aug", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Sep", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Oct", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Nov", parent: heatmapCalendarMonthsUl, })
            createEl("li", { text: "Dec", parent: heatmapCalendarMonthsUl, })

            const heatmapCalendarDaysUl = createEl("ul", {
                cls: "heatmap-calendar-days",
                parent: heatmapCalendarGraphDiv,
            })

            createEl("li", { text: "Mon", parent: heatmapCalendarDaysUl, })
            createEl("li", { text: "Tue", parent: heatmapCalendarDaysUl, })
            createEl("li", { text: "Wed", parent: heatmapCalendarDaysUl, })
            createEl("li", { text: "Thu", parent: heatmapCalendarDaysUl, })
            createEl("li", { text: "Fri", parent: heatmapCalendarDaysUl, })
            createEl("li", { text: "Sat", parent: heatmapCalendarDaysUl, })
            createEl("li", { text: "Sun", parent: heatmapCalendarDaysUl, })

            const heatmapCalendarBoxesUl = createEl("ul", {
                cls: "heatmap-calendar-boxes",
                parent: heatmapCalendarGraphDiv,
            })

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
