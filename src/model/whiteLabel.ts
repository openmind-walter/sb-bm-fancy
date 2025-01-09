

export interface WhiteLabel {
    ID: number,
    DOMAIN_NAME: string

}

export interface BookmakerWLDto {
    domain_name: string;
    active_bookmakers: string[];
    inactive_bookmakers: string[];
}