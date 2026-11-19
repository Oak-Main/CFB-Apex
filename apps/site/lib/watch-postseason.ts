import type { TvRow } from "./cfb-dataset";

export const watchUpdatedOn = "2026-11-19";
export const championshipWeek = 14;

export type WatchGame = TvRow & {
	championship?: { name: string; source: string; matchupSource?: string };
};

export const postseasonTables = [
	{
		caption: "College Football Playoff",
		columns: ["Round", "Game", "Date", "Time (ET)", "Network"],
		rows: [
			["First Round", "Campus site", "Fri, Dec. 18", "8:00 PM", "ESPN"],
			["First Round", "Campus site", "Sat, Dec. 19", "Noon", "ABC and ESPN"],
			["First Round", "Campus site", "Sat, Dec. 19", "3:30 PM", "TNT, truTV and HBO Max"],
			["First Round", "Campus site", "Sat, Dec. 19", "7:30 PM", "TNT, truTV and HBO Max"],
			["Quarterfinal", "Fiesta Bowl, Glendale, Ariz.", "Wed, Dec. 30", "7:30 PM", "TNT, truTV and HBO Max"],
			["Quarterfinal", "Cotton, Peach or Rose", "Fri, Jan. 1", "Noon", "TNT, truTV and HBO Max"],
			["Quarterfinal", "Cotton, Peach or Rose", "Fri, Jan. 1", "4:00 PM", "ABC and ESPN"],
			["Quarterfinal", "Cotton, Peach or Rose", "Fri, Jan. 1", "8:00 PM", "ESPN"],
			["Semifinal", "Orange Bowl, Miami Gardens, Fla.", "Thu, Jan. 14", "7:30 PM", "TNT, truTV and HBO Max"],
			["Semifinal", "Sugar Bowl, New Orleans", "Fri, Jan. 15", "7:30 PM", "ABC and ESPN"],
			["National Championship", "Allegiant Stadium, Las Vegas", "Mon, Jan. 25", "7:30 PM", "ABC and ESPN"],
		],
	},
	{
		caption: "Bowls run by ESPN Events",
		columns: ["Bowl", "Date", "Time (ET)", "Network"],
		rows: [
			["Celebration Bowl, Atlanta", "Sat, Dec. 12", "Noon", "ABC"],
			["Salute to Veterans Bowl, Montgomery, Ala.", "Tue, Dec. 15", "5:30 PM", "ESPN"],
			["Frisco Football Classic, Frisco, Texas", "Tue, Dec. 15", "9:00 PM", "ESPN"],
			["Boca Raton Bowl", "Fri, Dec. 18", "11:00 AM", "ESPN"],
			["Gasparilla Bowl, Tampa", "Fri, Dec. 18", "2:30 PM", "ESPN"],
			["Myrtle Beach Bowl, Conway, S.C.", "Mon, Dec. 21", "11:00 AM", "ESPN"],
			["Famous Idaho Potato Bowl, Boise", "Mon, Dec. 21", "2:30 PM", "ESPN"],
			["Cure Bowl, Orlando", "Tue, Dec. 22", "5:00 PM", "ESPN"],
			["Armed Forces Bowl, Fort Worth", "Wed, Dec. 23", "5:30 PM", "ESPN"],
			["Frisco Bowl, Frisco, Texas", "Wed, Dec. 23", "9:00 PM", "ESPN"],
			["New Mexico Bowl, Albuquerque", "Thu, Dec. 24", "2:30 PM", "ESPN"],
			["Hawai'i Bowl, Honolulu", "Thu, Dec. 24", "7:00 PM", "ESPN"],
			["Fenway Bowl, Boston", "Sat, Dec. 26", "2:00 PM", "ESPN"],
			["Birmingham Bowl", "Tue, Dec. 29", "2:00 PM", "ESPN"],
			["Las Vegas Bowl", "Thu, Dec. 31", "3:45 PM", "ESPN"],
			["Texas Bowl, Houston", "Thu, Dec. 31", "7:30 PM", "ESPN"],
			["First Responder Bowl, Dallas", "Sat, Jan. 2", "3:30 PM", "ABC"],
		],
	},
];

export const championshipGames: WatchGame[] = [
	{
		date: "2026-12-04",
		time_et: "18:00",
		tv: "CBS Sports Network",
		away: "tba",
		home: "liberty",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "CUSA Football Championship",
			source: "https://conferenceusa.com/sports/2026/10/19/fbchamp2026.aspx",
			matchupSource: "https://admin.conferenceusa.com/news/2026/11/16/football-fb-championship-chase-continues-as-cusa-enters-week-12.aspx",
		},
	},
	{
		date: "2026-12-04",
		time_et: "19:00",
		tv: "ESPN",
		away: "tba",
		home: "louisiana-tech",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "Sun Belt Football Championship",
			source: "https://sunbeltsports.org/sports/2026/11/2/FBChampionship2026.aspx",
			matchupSource: "https://sunbeltsports.org/news/2026/11/15/louisiana-tech-punches-ticket-to-championship-game-georgia-southern-app-state-clinch-bowl-eligibility-in-sun-belt-football-week-11-play.aspx",
		},
	},
	{
		date: "2026-12-04",
		time_et: "20:00",
		tv: "ABC",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "Big 12 Football Championship",
			source: "https://big12sports.com/news/2026/11/9/2026-edward-jones-big-12-football-championship-to-mark-final-chapter-of-marquee-conference-event.aspx",
		},
	},
	{
		date: "2026-12-04",
		time_et: "20:00",
		tv: "CBS and Paramount+",
		away: "tba",
		home: "boise-state",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "Pac-12 Football Championship",
			source: "https://pac-12.com/news/2026/11/16/2026-pac-12-football-championship-game-scenarios.aspx",
		},
	},
	{
		date: "2026-12-04",
		time_et: "21:00",
		tv: "FOX",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "Mountain West Football Championship",
			source: "https://themw.com/news/2026/6/4/broadcast-details-announced-for-2026-mountain-west-football-championship-game.aspx",
		},
	},
	{
		date: "2026-12-05",
		time_et: "12:00",
		tv: "ABC",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "ACC Football Championship",
			source: "https://theacc.com/news/2026/10/29/championship-saturday-awaits-tickets-on-sale-now-for-the-2026-acc-football-championship-game.aspx",
		},
	},
	{
		date: "2026-12-05",
		time_et: "12:00",
		tv: "ESPN",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "MAC Football Championship",
			source: "https://getsomemaction.com/news/2026/5/27/mac-announces-kickoff-times-broadcasting-schedule-for-2026-football-season.aspx",
		},
	},
	{
		date: "2026-12-05",
		time_et: "16:00",
		tv: "ABC",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "SEC Football Championship",
			source: "https://www.secsports.com/fbtv",
		},
	},
	{
		date: "2026-12-05",
		time_et: "20:00",
		tv: "ABC",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "American Conference Football Championship",
			source: "https://theamerican.org/news/2026/5/27/american-conference-announces-selected-television-designations-kickoff-times-for-2026-football-schedule.aspx",
		},
	},
	{
		date: "2026-12-05",
		time_et: "20:00",
		tv: "FOX",
		away: "tba",
		home: "tba",
		status: "scheduled",
		week: championshipWeek,
		championship: {
			name: "Big Ten Football Championship",
			source: "https://bigten.org/news/2026/8/19/championship-2026-discover-big-ten-football-championship-game-information.aspx",
		},
	},
];
